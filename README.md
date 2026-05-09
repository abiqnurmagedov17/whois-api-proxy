# 🌐 WHOIS API Proxy

> **Lightweight, production-ready WHOIS lookup proxy** with Upstash Redis caching, rate limiting, and stale-if-error resilience.

🔗 **Live API**: [`https://whois-api-proxy.vercel.app/api/whois`](https://whois-api-proxy.vercel.app/api/whois)  
📦 **Source**: [`github.com/abiqnurmagedov17/whois-api-proxy`](https://github.com/abiqnurmagedov17/whois-api-proxy)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔓 **CORS Enabled** | Public endpoint with configurable origin policies |
| 🗄️ **Upstash Redis Cache** | Shared cache across instances — no cold start data loss |
| ⚡ **Rate Limiting** | Per-IP throttling via Redis sorted sets (atomic operations) |
| ♻️ **Stale-if-Error** | Serve cached data when upstream fails — zero downtime |
| 🔍 **Domain Validation** | Strict FQDN validation via `validator` library |
| 🔄 **Retry + Timeout** | Automatic retry with exponential backoff + fetch timeout |
| 📊 **Monitoring Headers** | `X-Cache`, `X-RateLimit-*`, `X-Response-Time` for observability |
| 🧼 **Input Normalization** | Handles `HTTPS://GOOGLE.COM/path` → `google.com` |
| 🚀 **Serverless Friendly** | Runs on Vercel, Railway, Fly.io, or any Node.js host |

---

## 🚀 Quick Start

### Option 1: Deploy to Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fabiqnurmagedov17%2Fwhois-api-proxy)

1. Click the button above
2. Connect your GitHub account
3. **Add Environment Variables** (see below)
4. Deploy — your API is live in ~30 seconds! ✨

### Option 2: Run Locally

```bash
# Clone the repo
git clone https://github.com/abiqnurmagedov17/whois-api-proxy.git
cd whois-api-proxy

# Install dependencies
npm install

# Set environment variables (see .env.example)
cp .env.example .env
# Edit .env with your Upstash credentials

# Start development server (auto-reload on Node 18+)
npm run dev

# Or production mode
npm start
```

Server runs at: `http://localhost:3000/api/whois`

---

## 📡 API Usage

### Endpoint
```
GET /api/whois?domain=example.com
```

### Parameters
| Parameter | Type   | Required | Description           |
|-----------|--------|----------|-----------------------|
| `domain`  | string | ✅ Yes   | Domain to lookup      |

### Example Requests

#### cURL
```bash
curl "https://whois-api-proxy.vercel.app/api/whois?domain=google.com"
```

#### JavaScript (Fetch)
```javascript
const res = await fetch('https://whois-api-proxy.vercel.app/api/whois?domain=github.com');
const data = await res.json();
console.log(data);
```

#### React Hook Example
```jsx
function useWhois(domain) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!domain) return;
    fetch(`/api/whois?domain=${domain}`)
      .then(r => r.json())
      .then(setData);
  }, [domain]);
  return data;
}
```

---

## 📤 Response Format

### ✅ Success (200 OK)
```json
{
  "domain": "google.com",
  "registrar": "MarkMonitor Inc.",
  "creation_date": "1997-09-15",
  "expiration_date": "2028-09-14",
  "name_servers": ["ns1.google.com", "ns2.google.com"],
  "status": ["clientDeleteProhibited", "clientTransferProhibited"],
  "updated_date": "2023-09-12"
}
```

### 📦 Response Headers
```http
X-Cache: HIT                 # or MISS / STALE
X-Cache-Age: 120             # seconds since cached
X-Stale: true                # if serving stale data
X-RateLimit-Limit: 30        # max requests per minute
X-RateLimit-Remaining: 28    # remaining quota
X-RateLimit-Reset: 1735689600 # Unix timestamp for reset
X-Response-Time: 245ms       # request duration
```

### ❌ Error Responses

**Missing domain** (400 Bad Request)
```json
{ "error": "Domain parameter is required" }
```

**Invalid domain format** (400 Bad Request)
```json
{ "error": "Invalid domain format" }
```

**Rate limited** (429 Too Many Requests)
```json
{
  "error": "Too many requests",
  "retryAfter": 45
}
```

**Upstream timeout** (504 Gateway Timeout)
```json
{ "error": "Request timeout" }
```

**Upstream error** (500 Internal Server Error)
```json
{ "error": "Failed to fetch WHOIS data" }
```

> 🔐 **Note**: Error messages are generic in production. Detailed errors are logged server-side only.

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file or set these in your hosting platform:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `UPSTASH_REDIS_REST_URL` | ✅ Yes | — | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ Yes | — | Upstash Redis API token |
| `CACHE_TTL` | No | `3600` | Cache duration in seconds (1 hour) |
| `STALE_TTL` | No | `86400` | Stale cache retention in seconds (24 hours) |
| `FETCH_TIMEOUT` | No | `10000` | Fetch timeout in milliseconds (10s) |
| `RATE_LIMIT_MAX` | No | `30` | Max requests per IP per minute |
| `PORT` | No | `3000` | Server port for local development |

> 🔑 **Get Upstash credentials**:  
> 1. Visit [console.upstash.com](https://console.upstash.com)  
> 2. Create/connect a Redis database  
> 3. Copy **REST API URL** and **Token**  
> 4. Paste into Vercel Dashboard → Settings → Environment Variables

### CORS Configuration

Edit the `cors` initialization in `api/whois.js`:

```javascript
const cors = Cors({
  origin: '*', // ✅ OK for public WHOIS proxy
  // 🔒 For restricted access:
  // origin: ['https://yourdomain.com', 'http://localhost:3000'],
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
});
```

> 💡 Using `origin: '*'` is acceptable here because WHOIS data is public. Just don't expose sensitive internal APIs through the same proxy.

---

## 🛠️ Project Structure

```
whois-api-proxy/
├── api/
│   └── whois.js       # Main HTTP server + handler logic
├── .env.example       # Template for environment variables
├── .gitignore         # Ignored files (node_modules, .env, etc.)
├── package.json       # Dependencies + scripts
├── README.md          # This file
└── vercel.json        # Optional Vercel configuration
```

---

## 🔒 Security & Best Practices

1. **Rate Limiting**: Enabled by default (30 req/min/IP). Adjust via `RATE_LIMIT_MAX`.
2. **Input Validation**: Domains validated with `validator.isFQDN()` + normalization.
3. **Error Handling**: Internal errors logged server-side; clients receive generic messages.
4. **Timeout Protection**: Fetch requests abort after 10s to prevent hanging.
5. **Redis Security**: Tokens stored in environment variables — never commit to repo.
6. **CORS**: Public by default; restrict `origin` if integrating with private frontends.

---

## 🧪 Testing

```bash
# ✅ Valid lookup
curl -i "http://localhost:3000/api/whois?domain=github.com"

# ❌ Missing parameter
curl "http://localhost:3000/api/whois"

# ❌ Invalid domain
curl "http://localhost:3000/api/whois?domain=not-a-valid-domain"

# ❌ Path traversal attempt (sanitized)
curl "http://localhost:3000/api/whois?domain=../../../etc/passwd"

# 🔄 Test caching (second request should be faster + X-Cache: HIT)
curl -i "http://localhost:3000/api/whois?domain=vercel.com"
curl -i "http://localhost:3000/api/whois?domain=vercel.com"

# 🚫 Test rate limiting (spam 35 requests)
for i in {1..35}; do 
  curl -s "http://localhost:3000/api/whois?domain=test.com" | jq -r '.error'
done
# Expected: "Too many requests" after ~30 requests
```

---

## 🔄 How It Works (Request Flow)

```
1. Request arrives
   ↓
2. CORS middleware applied
   ↓
3. Validate: GET method + /api/whois path
   ↓
4. Normalize & validate domain (isFQDN)
   ↓
5. Rate limit check (Redis sorted set, atomic)
   ↓
6. Cache lookup (Redis key: whois:domain.com)
   ↓
   ├─ [CACHE HIT] → Return cached data + headers
   │   └─ If stale: trigger background refresh
   │
   └─ [CACHE MISS]
       ↓
       Fetch upstream (timeout + retry + backoff)
       ↓
       Save to cache (fire & forget)
       ↓
       Return fresh data + headers
```

---

## 🤝 Contributing

Contributions welcome! 🙌

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-idea`
3. Commit changes: `git commit -m 'feat: add your feature'`
4. Push: `git push origin feat/your-idea`
5. Open a Pull Request

### Development Guidelines
- Follow existing code style (ES Modules, async/await)
- Add tests for new features (if applicable)
- Update this README for user-facing changes

---

## 📄 License

MIT License — feel free to use, modify, and deploy.  
See [LICENSE](LICENSE) for details.

---

## 💡 Pro Tips

> 🎯 **For Production**:
> - Monitor Redis usage in [Upstash Console](https://console.upstash.com)
> - Set up alerts for rate limit hits or cache miss spikes
> - Use a custom domain + HTTPS for your deployed endpoint

> 🚀 **Scaling Further**:
> - Increase `RATE_LIMIT_MAX` or implement API key auth for trusted clients
> - Add bulk lookup endpoint with `redis.mget()` (if needed)
> - Integrate with logging services (Axiom, Logtail) via `console.log` streams

> 🛠️ **Debugging**:
> - Check `X-Cache` header to verify caching behavior
> - Use `X-Response-Time` to spot slow upstream responses
> - Server logs include `[WHOIS-PROXY]` prefix for easy filtering

---

> Built with ❤️ using **Node.js**, **Upstash Redis**, and good engineering practices.  
> Public WHOIS data should be accessible — reliably and responsibly. 🌍

*Maintained by [@abiqnurmagedov17](https://github.com/abiqnurmagedov17)* 🚀