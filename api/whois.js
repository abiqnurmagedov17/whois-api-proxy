import http from 'http';
import { parse } from 'url';
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
  origin: '*',
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
});

const PORT = parseInt(process.env.PORT || '3000', 10);
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
    req.socket?.remoteAddress ||
    (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null) ||
    'unknown'
  );
}

function sendJson(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    ...headers,
  });
  res.end(JSON.stringify(data));
}

// ─────────────────────────────────────────────────────
// RATE LIMIT (Upstash Redis) - FIXED & CLEAN
// ─────────────────────────────────────────────────────
async function checkRateLimit(identifier) {
  const key = `rl:${identifier}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW * 1000;

  // Step 1: Cleanup expired + count current requests
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zcount(key, windowStart, now);

  const results = await pipeline.exec();

  // Safe parser for Upstash SDK result formats
  const parseResult = (res) => {
    if (res === null || res === undefined) return null;
    if (Array.isArray(res) && res.length >= 2) return res[1];
    if (typeof res === 'object' && 'result' in res) return res.result;
    return res;
  };

  const count = parseResult(results[1]);

  // Optional debug logging (remove in production)
  // console.log('[RATE-LIMIT]', { identifier, count, limit: RATE_LIMIT_MAX });

  // Block if at or over limit
  if (count === null || count >= RATE_LIMIT_MAX) {
    const oldest = await redis.zrange(key, 0, 0);
    const reset = oldest[0]
      ? parseInt(oldest[0].split('-')[0]) + RATE_LIMIT_WINDOW * 1000      : now + RATE_LIMIT_WINDOW * 1000;
    return { allowed: false, remaining: 0, reset };
  }

  // Allowed → insert request timestamp
  await redis
    .pipeline()
    .zadd(key, { score: now, member: `${now}-${Math.random()}` })
    .expire(key, RATE_LIMIT_WINDOW + 10)
    .exec();

  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX - count - 1,
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
        headers: { 'User-Agent': 'WHOIS-Proxy/1.0 (+https://domainlu.com)' },
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`API responded with status ${res.status}`);      return await res.json();
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
// REQUEST HANDLER
// ─────────────────────────────────────────────────────
async function handleRequest(req, res) {
  const start = Date.now();
  const { pathname, query } = parse(req.url, true);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return runMiddleware(req, res, cors).then(() => {
      res.writeHead(204);
      res.end();
    });
  }

  // CORS + main logic
  await runMiddleware(req, res, cors);

  // Only handle /api/whois
  if (pathname !== '/api/whois') {
    return sendJson(res, 404, { error: 'Not found' });
  }

  // Method check
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  // Validate domain
  const rawDomain = query?.domain;
  if (!rawDomain || typeof rawDomain !== 'string') {
    return sendJson(res, 400, { error: 'Domain parameter is required' });
  }

  const domain = normalizeDomain(rawDomain);
  if (!isFQDN(domain, { require_tld: true })) {
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
  const cacheKey = `whois:${domain}`;
  const cached = await getCache(cacheKey);

  if (cached) {
    const isStale = Date.now() - cached.timestamp > CACHE_TTL * 1000;
    const headers = {
      ...rateHeaders,
      'X-Cache': 'HIT',
      'X-Cache-Age': String(Math.floor((Date.now() - cached.timestamp) / 1000)),
      'X-Response-Time': `${Date.now() - start}ms`,
    };

    if (isStale) {
      headers['X-Stale'] = 'true';
      // Background refresh (fire & forget)
      fetchWithRetry(
        `https://rewhois.com/api/whois?domain=${encodeURIComponent(domain)}`
      )
        .then((data) => setCache(cacheKey, data))
        .catch((err) => console.error('[STALE-REFRESH]', err));
    }

    return sendJson(res, 200, cached, headers);
  }

  // Fetch upstream
  try {
    const url = `https://rewhois.com/api/whois?domain=${encodeURIComponent(
      domain
    )}`;
    const data = await fetchWithRetry(url);
    setCache(cacheKey, data); // fire & forget

    return sendJson(res, 200, data, {
      ...rateHeaders,
      'X-Cache': 'MISS',
      'X-Response-Time': `${Date.now() - start}ms`,
    });
  } catch (error) {
    console.error('[WHOIS-PROXY]', {
      error: error.message,
      domain,
      ip: identifier,
      duration: Date.now() - start,
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
        'X-Stale': 'true',
        'X-Response-Time': `${Date.now() - start}ms`,
      });
    }

    const isTimeout = error.name === 'AbortError';
    return sendJson(
      res,
      isTimeout ? 504 : 500,
      {
        error: isTimeout ? 'Request timeout' : 'Failed to fetch WHOIS data',
      },
      rateHeaders
    );
  }
}

// ─────────────────────────────────────────────────────
// CREATE SERVER
// ─────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (err) {
    console.error('[SERVER-ERR]', err);
    sendJson(res, 500, { error: 'Internal server error' });  }
});

server.listen(PORT, () => {
  console.log(`🚀 WHOIS Proxy running at http://localhost:${PORT}/api/whois`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔌 Shutting down gracefully...');
  server.close(() => process.exit(0));
});