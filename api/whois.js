import Cors from 'cors';
import isFQDN from 'validator/lib/isFQDN.js';
import { Redis } from '@upstash/redis';

// ─────────────────────────────────────────────────────
// INIT REDIS (Upstash)
// ─────────────────────────────────────────────────────
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ─────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────
const cors = Cors({
  origin: ['https://whois-api-proxy.vercel.app', 'http://localhost:3000'],
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
});

const CACHE_TTL = parseInt(process.env.CACHE_TTL || '3600', 10);
const FETCH_TIMEOUT = parseInt(process.env.FETCH_TIMEOUT || '10000', 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '30', 10);
const RATE_LIMIT_WINDOW = 60; // seconds

// ─────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

function normalizeDomain(domain) {
  return domain
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '')
    .split('/')[0] || '';
}

function getIdentifier(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return (
    (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null) ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function sendJson(res, statusCode, data, headers = {}) {
  res.setHeader('Content-Type', 'application/json');
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  res.status(statusCode).json(data);
}

// ─────────────────────────────────────────────────────
// RATE LIMIT (ATOMIC - Fix Race Condition)
// ─────────────────────────────────────────────────────
async function checkRateLimit(identifier) {
  const key = `rl:${identifier}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW * 1000;

  // SATUKAN dalam 1 pipeline (ATOMIC)
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, { score: now, member: `${now}-${Math.random()}` });
  pipeline.zcount(key, windowStart, now);
  pipeline.expire(key, RATE_LIMIT_WINDOW + 10);

  const results = await pipeline.exec();

  const parseResult = (res) => {
    if (res === null || res === undefined) return null;
    if (Array.isArray(res) && res.length >= 2) return res[1];
    if (typeof res === 'object' && 'result' in res) return res.result;
    return res;
  };

  const count = parseResult(results[2]); // zcount result

  if (count > RATE_LIMIT_MAX) {
    const oldest = await redis.zrange(key, 0, 0);
    const reset = oldest[0]
      ? parseInt(oldest[0].split('-')[0]) + RATE_LIMIT_WINDOW * 1000
      : now + RATE_LIMIT_WINDOW * 1000;
    return { allowed: false, remaining: 0, reset };
  }

  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX - count,
    reset: now + RATE_LIMIT_WINDOW * 1000,
  };
}

// ─────────────────────────────────────────────────────
// CACHE (Upstash Redis)
// ─────────────────────────────────────────────────────
async function getCache(key) {
  const data = await redis.get(key);
  return data ? { ...data, cached: true } : null;
}

async function setCache(key, data, ttl = CACHE_TTL) {
  redis
    .set(key, { ...data, cached: false, timestamp: Date.now() }, { ex: ttl })
    .catch((err) => console.error('[CACHE-ERR]', err));
}

// ─────────────────────────────────────────────────────
// FETCH WITH TIMEOUT + RETRY
// ─────────────────────────────────────────────────────
async function fetchWithRetry(url, retries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'WHOIS-Proxy/1.0' },
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`API responded with status ${res.status}`);
      return await res.json();
    } catch (err) {
      clearTimeout(timeout);
      lastError = err;
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 100 * attempt));
    }
  }
  throw lastError;
}

// ─────────────────────────────────────────────────────
// MAIN HANDLER (for Vercel)
// ─────────────────────────────────────────────────────
export default async function handler(req, res) {
  const start = Date.now();
  const domain = req.query?.domain;

  // CORS
  await runMiddleware(req, res, cors);

  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Only GET method
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  // Validate domain
  if (!domain || typeof domain !== 'string') {
    return sendJson(res, 400, { error: 'Domain parameter is required' });
  }

  const normalizedDomain = normalizeDomain(domain);
  if (!isFQDN(normalizedDomain, { require_tld: true })) {
    return sendJson(res, 400, { error: 'Invalid domain format' });
  }

  const identifier = getIdentifier(req);

  // Rate limit
  const rateLimit = await checkRateLimit(`ip:${identifier}`);
  const rateHeaders = {
    'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
    'X-RateLimit-Remaining': String(rateLimit.remaining),
    'X-RateLimit-Reset': String(Math.ceil(rateLimit.reset / 1000)),
  };

  if (!rateLimit.allowed) {
    return sendJson(res, 429, {
      error: 'Too many requests',
      retryAfter: Math.ceil((rateLimit.reset - Date.now()) / 1000),
    }, rateHeaders);
  }

  // Cache check
  const cacheKey = `whois:${normalizedDomain}`;
  const cached = await getCache(cacheKey);

  if (cached) {
    const cacheAge = Date.now() - cached.timestamp;
    const isStale = cacheAge > CACHE_TTL * 1000;

    if (isStale) {
      // Background refresh
      fetchWithRetry(`https://rewhois.com/api/whois?domain=${encodeURIComponent(normalizedDomain)}`)
        .then((data) => setCache(cacheKey, data))
        .catch((err) => console.error('[STALE-REFRESH]', err));
    }

    return sendJson(res, 200, cached, {
      ...rateHeaders,
      'X-Cache': 'HIT',
      'X-Cache-Age': String(Math.floor(cacheAge / 1000)),
      'X-Response-Time': `${Date.now() - start}ms`,
    });
  }

  // Fetch upstream
  try {
    const upstreamUrl = `https://rewhois.com/api/whois?domain=${encodeURIComponent(normalizedDomain)}`;
    const data = await fetchWithRetry(upstreamUrl);
    setCache(cacheKey, data);

    return sendJson(res, 200, data, {
      ...rateHeaders,
      'X-Cache': 'MISS',
      'X-Response-Time': `${Date.now() - start}ms`,
    });
  } catch (error) {
    console.error('[WHOIS-PROXY]', {
      error: error.message,
      domain: normalizedDomain,
      ip: identifier,
    });

    // Stale-if-error fallback
    const stale = await redis.get(cacheKey);
    if (stale) {
      return sendJson(res, 200, {
        ...stale,
        warning: 'Serving stale data due to upstream error',
      }, {
        ...rateHeaders,
        'X-Cache': 'STALE',
        'X-Response-Time': `${Date.now() - start}ms`,
      });
    }

    const isTimeout = error.name === 'AbortError';
    return sendJson(
      res,
      isTimeout ? 504 : 500,
      { error: isTimeout ? 'Request timeout' : 'Failed to fetch WHOIS data' },
      rateHeaders
    );
  }
}