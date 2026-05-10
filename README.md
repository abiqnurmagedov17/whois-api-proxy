# 🌐 WHOIS API Proxy v2.1.0

> **Production-ready WHOIS lookup proxy** with Upstash Redis caching, **sliding window rate limiting**, **Telegram Bot integration**, and stale-if-error resilience.

🔗 **Live API**: [`https://whois-api-proxy.vercel.app/api/whois`](https://whois-api-proxy.vercel.app/api/whois)  
🤖 **Telegram Bot**: [@WhoisLookupBot](https://t.me/WhoisLookupBot) *(coming soon)*  
📦 **Source**: [`github.com/abiqnurmagedov17/whois-api-proxy`](https://github.com/abiqnurmagedov17/whois-api-proxy)  
📄 **License**: MIT

---

## ✨ Features

| Feature | Status | Description |
|---------|--------|-------------|
| 🔓 **CORS Enabled** | ✅ | Public endpoint with configurable origin policies |
| 🗄️ **Upstash Redis Cache** | ✅ | Shared cache across instances — no cold start data loss |
| ⚡ **Sliding Window Rate Limit** | ✅ | Precise per-IP throttling via `@upstash/ratelimit` |
| 🤖 **Telegram Bot Integration** | ✅ | Query WHOIS directly via Telegram with rich formatting |
| ♻️ **Stale-if-Error** | ✅ | Serve cached data when upstream fails — zero downtime |
| 🔍 **Domain Validation** | ✅ | Strict FQDN validation via `validator` library + normalization |
| 🔄 **Retry + Timeout** | ✅ | Automatic retry with exponential backoff + AbortController |
| 📊 **Monitoring Headers** | ✅ | `X-Cache`, `X-RateLimit-*`, `X-Response-Time` for observability |
| 🧼 **Input Normalization** | ✅ | Handles `HTTPS://GOOGLE.COM/path` → `google.com` |
| 🚀 **Serverless Friendly** | ✅ | Runs on Vercel, Railway, Fly.io, or any Node.js 20+ host |
| 🛡️ **Graceful Shutdown** | ✅ | Proper SIGTERM handling for clean deployments |

---

## 🚀 Quick Start

### Option 1: Deploy to Vercel (Recommended) ⚡

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fabiqnurmagedov17%2Fwhois-api-proxy)

1. Click the button above
2. Connect your GitHub account
3. **Add Environment Variables** (see [Configuration](#-configuration) below)
4. Deploy — your API is live in ~30 seconds! ✨

### Option 2: Run Locally 🖥️

```bash
# Clone the repository
git clone https://github.com/abiqnurmagedov17/whois-api-proxy.git
cd whois-api-proxy

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your Upstash + Telegram credentials

# Start development server (auto-reload on Node 20+)
npm run dev

# Start Telegram bot in development
npm run dev:bot

# Or run in production mode
npm start
```

Server runs at: `http://localhost:3000/api/whois`  
Telegram webhook: `http://localhost:3000/api/telegram`

---

## 📡 API Usage

### WHOIS Endpoint
```
GET /api/whois?domain=example.com
```

#### Parameters
| Parameter | Type   | Required | Description           |
|-----------|--------|----------|-----------------------|
| `domain`  | string | ✅ Yes   | Domain name to lookup |

#### Example Requests

**cURL**
```bash
curl "https://whois-api-proxy.vercel.app/api/whois?domain=google.com"
```

**JavaScript (Fetch API)**
```javascript
const res = await fetch('https://whois-api-proxy.vercel.app/api/whois?domain=github.com');
const data = await res.json();
console.log(data);
```

**React Hook Example**
```jsx
function useWhois(domain) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (!domain) return;
    setLoading(true);
    fetch(`/api/whois?domain=${domain}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [domain]);
  
  return { data, loading };
}
```

**Python Example**
```python
import requests

response = requests.get(
    "https://whois-api-proxy.vercel.app/api/whois",
    params={"domain": "github.com"}
)
print(response.json())
```

---

### 🤖 Telegram Bot Usage

**Start the bot**: [@WhoisLookupBot](https://t.me/WhoisLookupBot) or send `/start`

**Available Commands**:
| Command | Description |
|---------|-------------|
| `/start` | Welcome message + quick start guide |
| `/help` | Display usage instructions |
| `/about` | Bot information & tech stack |
| `/ping` | Check bot latency |
| `/whois <domain>` | Lookup WHOIS data for a domain |

**Quick Lookup**: Simply send a domain name (e.g., `google.com`) without any command!

**Example Conversation**:
```
You: /whois github.com
Bot: 🔍 WHOIS Lookup: github.com
     ━━━━━━━━━━━━━━━━━━━━━
     📅 Registrasi: 15 Oktober 2007
     ⏰ Kadaluarsa: 15 Oktober 2025
     ✅ Sisa waktu: 180 hari
     🏢 Registrar: MarkMonitor Inc.
     🌍 Nameservers:
        • dns1.p08.nsone.net
        • dns2.p08.nsone.net
     📊 Status: clientDeleteProhibited, clientTransferProhibited
```

---

## 📤 Response Format

### ✅ Success (200 OK)
```json
{
  "domain": "google.com",
  "registrar": "MarkMonitor Inc.",
  "createdDate": "1997-09-15T04:00:00Z",
  "expiryDate": "2028-09-14T04:00:00Z",
  "nameservers": ["ns1.google.com", "ns2.google.com"],
  "status": ["clientDeleteProhibited", "clientTransferProhibited"],
  "updatedDate": "2023-09-12T09:30:00Z",
  "existed": true
}
```

### 📦 Response Headers
```http
X-Cache: HIT                    # or MISS / STALE
X-Cache-Age: 120                # seconds since cached
X-Stale: true                   # if serving stale data (optional)
X-RateLimit-Limit: 30           # max requests per minute
X-RateLimit-Remaining: 28       # remaining quota
X-RateLimit-Reset: 1735689600   # Unix timestamp for quota reset
X-Response-Time: 245ms          # request processing duration
```

### ❌ Error Responses

| Status | Condition | Response |
|--------|-----------|----------|
| `400` | Missing domain parameter | `{ "error": "Domain parameter is required" }` |
| `400` | Invalid domain format | `{ "error": "Invalid domain format" }` |
| `404` | Unknown endpoint | `{ "error": "Not found" }` |
| `405` | Non-GET method | `{ "error": "Method not allowed" }` |
| `429` | Rate limit exceeded | `{ "error": "Too many requests", "retryAfter": 45 }` |
| `500` | Upstream error | `{ "error": "Failed to fetch WHOIS data" }` |
| `504` | Request timeout | `{ "error": "Request timeout" }` |

> 🔐 **Security Note**: Error messages are generic in production. Detailed errors are logged server-side only to prevent information leakage.

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file or set these in your hosting platform:

#### Core Settings
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `UPSTASH_REDIS_REST_URL` | ✅ Yes | — | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ Yes | — | Upstash Redis API token |
| `CACHE_TTL` | No | `3600` | Cache duration for fresh data (seconds) |
| `STALE_TTL` | No | `86400` | Stale cache retention for fallback (seconds) |
| `FETCH_TIMEOUT` | No | `10000` | Fetch timeout for upstream API (milliseconds) |

#### Rate Limiting
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RATE_LIMIT_MAX` | No | `30` | Max requests per IP per window |
| `RATE_LIMIT_WINDOW` | No | `60` | Rate limit window duration (seconds) |

#### Telegram Bot *(Optional)*
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | ❌ No | — | Bot token from @BotFather |
| `WEBHOOK_URL` | ❌ No | Auto | Webhook URL for Telegram updates |

#### Server
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Server port for local development |
| `NODE_ENV` | No | `production` | Environment mode |

> 🔑 **Get Upstash credentials**:  
> 1. Visit [console.upstash.com](https://console.upstash.com)  
> 2. Create or connect a Redis database  
> 3. Copy **REST API URL** and **Token**  
> 4. Paste into Vercel Dashboard → Settings → Environment Variables

> 🤖 **Get Telegram Bot Token**:  
> 1. Start a chat with [@BotFather](https://t.me/BotFather)  
> 2. Send `/newbot` and follow the instructions  
> 3. Copy the API token and add to `TELEGRAM_BOT_TOKEN`

### CORS Configuration

Edit the `cors` initialization in `api/whois.js`:

```javascript
const cors = Cors({
  origin: '*', // ✅ OK for public WHOIS proxy
  // 🔒 For restricted access, use:
  // origin: ['https://yourdomain.com', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
});
```

> 💡 Using `origin: '*'` is acceptable here because WHOIS data is public information. Just don't expose sensitive internal APIs through the same proxy.

---

## 🛠️ Project Structure

```
whois-api-proxy/
├── api/
│   ├── whois.js          # Main HTTP server + WHOIS handler
│   └── telegram.js       # Telegram Bot webhook handler
├── test/
│   └── rate-limit.js     # Rate limit testing utilities
├── .env.example          # Template for environment variables
├── .gitignore            # Ignored files (node_modules, .env, etc.)
├── package.json          # Dependencies + scripts
├── package-lock.json     # Lock file for reproducible installs
├── README.md             # This file
├── vercel.json           # Vercel configuration (rewrites, runtime)
└── eslint.config.mjs     # ESLint configuration
```

---

## 🔄 Available Scripts

```json
{
  "scripts": {
    "dev": "node --watch api/whois.js",      // Dev server with auto-reload
    "dev:bot": "node --watch api/telegram.js", // Dev Telegram bot
    "start": "node api/whois.js",             // Production server
    "test": "node test/rate-limit.js",        // Run rate limit tests
    "deploy": "vercel --prod",                // Deploy to Vercel production
    "lint": "eslint api/*.js"                 // Lint JavaScript files
  }
}
```

---

## 🔒 Security & Best Practices

### ✅ Implemented
1. **Sliding Window Rate Limiting**: Precise throttling via `@upstash/ratelimit`
2. **Input Validation**: Domains validated with `validator.isFQDN()` + aggressive normalization
3. **Error Handling**: Internal errors logged server-side; clients receive generic, safe messages
4. **Timeout Protection**: Fetch requests abort after configurable timeout to prevent hanging
5. **Redis Security**: Tokens stored in environment variables — never committed to repository
6. **CORS**: Public by default; easily restrict `origin` for private frontend integration
7. **Telegram Bot Security**: Per-user cooldown + input validation + HTML sanitization

### 🔧 Recommended for Production
```bash
# 1. Restrict CORS origin if using with specific frontend
# Edit api/whois.js:
origin: ['https://yourdomain.com']

# 2. Enable debug logging temporarily for troubleshooting
// In rate limit handler:
console.log('[RATE-LIMIT]', { identifier, remaining, limit: RATE_LIMIT_MAX });

# 3. Monitor Redis usage
# Visit: https://console.upstash.com → Your Database → Metrics

# 4. Set up alerts for unusual activity
# Upstash Console → Alerts → Create alert for high command count

# 5. Use a custom domain + HTTPS
# Vercel: Project Settings → Domains → Add your domain

# 6. Secure Telegram webhook
// Verify webhook requests with Telegram's secret token
// Add IP allowlist for Telegram webhook IPs
```

---

## 🧪 Testing

### Basic API Tests
```bash
# ✅ Valid lookup
curl -i "http://localhost:3000/api/whois?domain=github.com"

# ❌ Missing parameter
curl "http://localhost:3000/api/whois"

# ❌ Invalid domain format
curl "http://localhost:3000/api/whois?domain=not-a-valid-domain"

# ❌ Path traversal attempt (sanitized automatically)
curl "http://localhost:3000/api/whois?domain=../../../etc/passwd"

# 🔄 Test caching (second request should be faster + X-Cache: HIT)
curl -i "http://localhost:3000/api/whois?domain=vercel.com"
curl -i "http://localhost:3000/api/whois?domain=vercel.com"
```

### Rate Limit Testing
```bash
# Using the included test script
npm test

# Or manually spam requests (default limit: 30/min)
for i in {1..35}; do 
  echo -n "Request $i: "
  curl -s "http://localhost:3000/api/whois?domain=test.com" | jq -r '.error // .domain'
done
# Expected: Requests 1-30 succeed, 31+ return "Too many requests"
```

### Telegram Bot Testing (Local)
```bash
# Start bot in development mode
npm run dev:bot

# Use ngrok to expose local server to Telegram
ngrok http 3000

# Set webhook manually (optional)
curl "http://localhost:3000/api/telegram?set_webhook=true"

# Test in Telegram: send /ping or a domain name
```

### Quick Testing with Different Environments
```bash
# Test against production deployment
curl "https://whois-api-proxy.vercel.app/api/whois?domain=github.com"

# Test with custom rate limit for development
RATE_LIMIT_MAX=5 RATE_LIMIT_WINDOW=10 npm run dev
```

---

## 🔄 Architecture Flow

```
┌─────────────────┐
│   Request       │
│   GET /api/whois?domain=example.com
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 1. CORS Middleware │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. Path Validation│
│    /api/whois or /api/telegram
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. Domain Normalization │
│    HTTPS://GOOGLE.COM → google.com │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. Domain Validation │
│    isFQDN() check │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. Rate Limit Check │
│    @upstash/ratelimit │
│    Sliding window algorithm │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐  ┌────────────┐
│BLOCKED │  │ALLOWED     │
│429     │  │Continue    │
└────────┘  └────┬───────┘
                 │
                 ▼
┌─────────────────┐
│ 6. Cache Lookup │
│    Redis: whois:domain.com │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐  ┌────────────┐
│HIT     │  │MISS        │
│Return  │  │Fetch upstream │
│cached  │  │(retry + timeout)│
│+ headers│ │            │
└────┬───┘  └────┬───────┘
     │          │
     │          ▼
     │  ┌────────────┐
     │  │Save to cache│
     │  │(fire & forget)│
     │  └────┬───────┘
     │       │
     ▼       ▼
┌─────────────────┐
│ 7. Send Response │
│    + Monitoring Headers │
└─────────────────┘
```

### Telegram Bot Flow
```
┌─────────────────┐
│ Telegram User   │
│ Sends: google.com │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Webhook Handler │
│ /api/telegram  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Input Validation│
│ + Rate Check   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Call WHOIS API │
│ (internal or external) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Format Response │
│ HTML + Emojis  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Send to User   │
│ via Telegram API │
└─────────────────┘
```

---

## 🤝 Contributing

Contributions are welcome! 🙌 Here's how to get started:

### Getting Started
1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/whois-api-proxy.git`
3. **Create a branch**: `git checkout -b feat/your-amazing-feature`
4. **Make changes** following the guidelines below
5. **Test** your changes locally
6. **Commit**: `git commit -m 'feat: add your amazing feature'`
7. **Push**: `git push origin feat/your-amazing-feature`
8. **Open a Pull Request** 🎉

### Development Guidelines
- ✅ Use ES Modules syntax (`import`/`export`)
- ✅ Follow existing code style (async/await, consistent spacing)
- ✅ Add JSDoc comments for new functions
- ✅ Test rate limiting and caching behavior
- ✅ Update this README for user-facing changes
- ✅ Keep environment variables out of commits
- ✅ Run `npm run lint` before submitting PRs

### Good First Issues
Look for issues labeled [`good first issue`](https://github.com/abiqnurmagedov17/whois-api-proxy/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) if you're new to the project!

---

## 📄 License

This project is licensed under the **MIT License** — feel free to use, modify, and deploy.

```
MIT License

Copyright (c) 2024 Abiqnurmagedov17

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 💡 Pro Tips

### 🎯 For Production Deployments
```bash
# Monitor Redis usage regularly
# → https://console.upstash.com → Your Database → Metrics

# Set up alerts for unusual activity
# → Upstash Console → Alerts → Create alert for:
#   - High command count (potential abuse)
#   - Memory usage threshold
#   - Connection errors

# Use a custom domain + HTTPS
# → Vercel: Project Settings → Domains → Add your domain
# → Enable automatic HTTPS (default on Vercel)

# Consider adding API key auth for trusted clients
# → Add simple header check in handleRequest()
```

### 🚀 Scaling Further
```javascript
// Increase rate limit for trusted IPs
if (trustedIPs.includes(identifier)) {
  RATE_LIMIT_MAX = 100; // Higher limit for known clients
}

// Add bulk lookup endpoint (if needed)
// POST /api/whois/bulk with { domains: ["a.com", "b.com"] }
// Use redis.mget() for efficient cache retrieval

// Integrate structured logging
// Replace console.log with pino/winston for log aggregation
// → Compatible with Axiom, Logtail, Datadog, etc.

// Add Telegram bot admin commands
// /broadcast, /stats, /reset-limit for bot management
```

### 🛠️ Debugging Like a Pro
```bash
# Check caching behavior via headers
curl -i "https://your-app.vercel.app/api/whois?domain=example.com" | grep X-Cache

# Spot slow upstream responses
curl -i "https://your-app.vercel.app/api/whois?domain=example.com" | grep X-Response-Time

# Filter server logs efficiently
# Logs include [WHOIS-PROXY] prefix:
vercel logs --prod | grep WHOIS-PROXY

# Test stale-if-error behavior
# 1. Make a request to cache data
# 2. Temporarily break upstream URL in code
# 3. Request again → should return stale data + X-Stale: true

# Debug Telegram webhook
# Enable TELEGRAM_DEBUG=true to log incoming updates
```

### 🔧 Local Development Shortcuts
```bash
# Quick test with different domains
alias whois-test='curl -s "http://localhost:3000/api/whois?domain=$1" | jq'

# Test rate limit with custom settings
RATE_LIMIT_MAX=5 RATE_LIMIT_WINDOW=10 npm run dev

# Watch for file changes + auto-restart (Node 20+)
npm run dev  # Uses node --watch

# Check Redis keys directly (requires Upstash CLI)
npm install -g @upstash/cli
upstash redis keys "whois:*"
upstash redis get "ratelimit:ip:127.0.0.1"

# Test Telegram bot locally with ngrok
ngrok http 3000
# Then set webhook to: https://your-ngrok-url.app/api/telegram
```

---

## 🆘 Troubleshooting

| Issue | Possible Cause | Solution |
|-------|---------------|----------|
| `Error: Failed to fetch WHOIS data` | Upstream API down or timeout | Check `FETCH_TIMEOUT`, retry later, or check stale fallback |
| `Too many requests` (immediately) | Rate limit too strict or IP detection issue | Check `RATE_LIMIT_MAX`, verify `x-forwarded-for` parsing |
| Cache not working | Redis connection issue | Verify `UPSTASH_REDIS_REST_URL` and `TOKEN` in env vars |
| CORS errors in browser | Origin not allowed | Update `cors.origin` config or check browser console for details |
| Domain validation fails | Invalid format or edge case | Check `validator` library docs, test with `isFQDN` directly |
| Telegram bot not responding | Webhook not set or token invalid | Verify `TELEGRAM_BOT_TOKEN`, check webhook with `/getWebhookInfo` |
| Bot commands not working | Message filter misconfigured | Check `telegraf/filters` import and message handler logic |

---

> 🌍 **Philosophy**: Public WHOIS data should be accessible — reliably, responsibly, and with good engineering practices. This proxy exists to make that easier.

> Built with ❤️ using **Node.js 20**, **Upstash Redis**, **Telegraf**, and lessons learned from debugging production systems at 3 AM.

*Maintained by [@abiqnurmagedov17](https://github.com/abiqnurmagedov17)* 🚀

---

## 📈 Version History

| Version | Date | Changes |
|---------|------|---------|
| `2.1.0` | 2026 | ➕ Telegram Bot integration, ⚡ Sliding window rate limiting via `@upstash/ratelimit`, 🔄 Node.js 20.x runtime, 🧹 ESLint config, 📦 New scripts (`dev:bot`, `test`, `deploy`, `lint`) |
| `2.0.0` | 2026 | 🔄 Migrated to ES Modules, ♻️ Stale-if-error resilience, 📊 Enhanced monitoring headers |
| `1.1.0` | 2026 | Fixed rate limit logic (check-then-insert), improved result parsing |
| `1.0.0` | 2026 | Initial release with Redis caching, rate limiting, and basic WHOIS proxy |

---

> 💬 **Have questions or feedback?**  
> Open an [issue](https://github.com/abiqnurmagedov17/whois-api-proxy/issues) or reach out via [@ab.iqqq](https://instagram.com/ab.iqqq) on Instagram 🙌🏻

---

<p align="center">
  <sub>Built with ⚡ by <a href="https://github.com/abiqnurmagedov17">Abiq</a> • <a href="https://rommiui.com">rommiui.com</a></sub>
</p>