import Cors from 'cors';
import isFQDN from 'validator/lib/isFQDN';
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
  origin: '*', // Public endpoint — aman dengan rate limit + cache
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
});

const CACHE_TTL = parseInt(process.env.CACHE_TTL || '3600', 10);
const STALE_TTL = parseInt(process.env.STALE_TTL || '86400', 10); // 24 jam untuk stale cache
const FETCH_TIMEOUT = parseInt(process.env.FETCH_TIMEOUT || '10000', 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '30', 10);
const RATE_LIMIT_WINDOW = 60;

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
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '')
    .split('/')[0];
}

function getIdentifier(req) {
  // Ambil IP pertama dari x-forwarded-for (bisa multiple: "1.1.1.1, 2.2.2.2")  const forwarded = req.headers['x-forwarded-for'];
  return req.ip || 
         (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null) || 
         'unknown';
}

// ─────────────────────────────────────────────────────
// RATE LIMIT (Upstash Redis - Sorted Set)
// ─────────────────────────────────────────────────────
async function checkRateLimit(identifier) {
  const key = `rl:${identifier}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW * 1000;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart); // hapus expired
  pipeline.zadd(key, { score: now, member: `${now}-${Math.random()}` }); // tambah request
  pipeline.zcard(key); // hitung total
  pipeline.expire(key, RATE_LIMIT_WINDOW + 10); // auto cleanup
  
  const [, , , count] = await pipeline.exec();

  // FIX: >= karena kita udah insert request sebelum cek
  if (count >= RATE_LIMIT_MAX) {
    // FIX: Ambil OLDEST (tanpa rev: true) untuk hitung reset time
    const oldest = await redis.zrange(key, 0, 0);
    const reset = oldest[0] 
      ? parseInt(oldest[0].split('-')[0]) + RATE_LIMIT_WINDOW * 1000 
      : now + RATE_LIMIT_WINDOW * 1000;
    
    return { allowed: false, remaining: 0, reset };
  }

  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX - count,
    reset: now + RATE_LIMIT_WINDOW * 1000
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
  redis.set(key, { ...data, cached: false, timestamp: Date.now() }, { ex: ttl })    .catch(err => console.error('[CACHE-ERR]', err));
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
        headers: { 
          'User-Agent': 'WHOIS-Proxy/1.0 (+https://domainlu.com)' // FIX: Better User-Agent
        }
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`API responded with status ${res.status}`);
      return await res.json();

    } catch (err) {
      clearTimeout(timeout);
      lastError = err;
      
      // FIX: Retry juga kalau timeout, kecuali udah attempt terakhir
      if (attempt === retries) throw err;
      
      // Exponential backoff
      await new Promise(r => setTimeout(r, 100 * attempt));
    }
  }
  throw lastError;
}

// ─────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────
export default async function handler(req, res) {
  const start = Date.now();
  const identifier = getIdentifier(req);

  // 1. CORS
  await runMiddleware(req, res, cors);

  // 2. Method check  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 3. Validate domain
  const rawDomain = req.query?.domain;
  if (!rawDomain || typeof rawDomain !== 'string') {
    return res.status(400).json({ error: 'Domain parameter is required' });
  }

  const domain = normalizeDomain(rawDomain);
  if (!isFQDN(domain, { require_tld: true })) {
    return res.status(400).json({ error: 'Invalid domain format' });
  }

  // 4. Rate limit
  const rateLimit = await checkRateLimit(`ip:${identifier}`);
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
  res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimit.reset / 1000));

  if (!rateLimit.allowed) {
    return res.status(429).json({ 
      error: 'Too many requests', 
      retryAfter: Math.ceil((rateLimit.reset - Date.now()) / 1000) 
    });
  }

  // 5. Cache check
  const cacheKey = `whois:${domain}`;
  const cached = await getCache(cacheKey);

  // ✅ STALE-IF-ERROR: Return stale cache kalau ada, meskipun expired
  if (cached) {
    const isStale = Date.now() - cached.timestamp > CACHE_TTL * 1000;
    
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('X-Cache-Age', Math.floor((Date.now() - cached.timestamp) / 1000));
    
    if (isStale) {
      res.setHeader('X-Stale', 'true');
      // Trigger background refresh (fire & forget)
      fetchWithRetry(`https://rewhois.com/api/whois?domain=${encodeURIComponent(domain)}`)
        .then(freshData => setCache(cacheKey, freshData))
        .catch(err => console.error('[STALE-REFRESH]', err));
    }
    
    return res.status(200).json(cached);
  }
  res.setHeader('X-Cache', 'MISS');

  // 6. Fetch upstream
  try {
    const url = `https://rewhois.com/api/whois?domain=${encodeURIComponent(domain)}`;
    const data = await fetchWithRetry(url);

    // 7. Save cache (fire & forget)
    setCache(cacheKey, data);

    // 8. Response
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Response-Time', `${Date.now() - start}ms`);

    return res.status(200).json(data);

  } catch (error) {
    // Log internal only
    console.error('[WHOIS-PROXY]', {
      error: error.message,
      domain,
      ip: identifier,
      duration: Date.now() - start
    });

    // ✅ STALE-IF-ERROR: Return stale cache kalau upstream error
    const stale = await redis.get(cacheKey);
    if (stale) {
      res.setHeader('X-Cache', 'STALE');
      res.setHeader('X-Stale', 'true');
      res.setHeader('X-Response-Time', `${Date.now() - start}ms`);
      return res.status(200).json({ ...stale, warning: 'Serving stale data due to upstream error' });
    }

    const isTimeout = error.name === 'AbortError';
    return res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? 'Request timeout' : 'Failed to fetch WHOIS data'
    });
  }
}