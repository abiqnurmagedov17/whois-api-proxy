# 🌐 WHOIS API Proxy

A lightweight, CORS-enabled proxy server for domain WHOIS lookups, built with **Next.js API Routes** and ready for instant deployment on **Vercel**.

---

## ✨ Features

- 🔓 **CORS Support**: Configurable cross-origin resource sharing for frontend integration
- 🚀 **Serverless Ready**: Optimized for Vercel/Edge deployment with zero config
- 🔍 **Simple API**: Clean REST endpoint with query parameter support
- 🛡️ **Error Handling**: Graceful error responses with meaningful messages
- 📦 **Zero Dependencies**: Uses native `fetch` and built-in Next.js features
- ⚡ **Method Validation**: Strict GET-only endpoint for security

---

## 🚀 Quick Start

### 1. Deploy to Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyour-username%2Fwhois-api-proxy)

1. Click the button above
2. Connect your GitHub repository
3. Deploy instantly — your API is live!

### 2. Local Development

```bash
# Clone the repository
git clone https://github.com/your-username/whois-api-proxy.git
cd whois-api-proxy

# Install dependencies (if using package.json)
npm install # or yarn install

# Run development server
npm run dev # or yarn dev
```

Your API will be available at: `http://localhost:3000/api/whois`

---

## 📡 API Usage

### Endpoint
```
GET /api/whois?domain=example.com
```

### Parameters
| Parameter | Type   | Required | Description              |
|-----------|--------|----------|--------------------------|
| `domain`  | string | ✅ Yes   | Domain name to lookup    |

### Example Requests

#### cURL
```bash
curl "https://your-vercel-app.vercel.app/api/whois?domain=google.com"
```

#### JavaScript (Fetch)
```javascript
const response = await fetch('https://your-vercel-app.vercel.app/api/whois?domain=google.com');
const data = await response.json();
console.log(data);
```

#### React Example
```jsx
useEffect(() => {
  fetch('/api/whois?domain=example.com')
    .then(res => res.json())
    .then(data => setWhoisData(data));
}, []);
```

---

## 📤 Response Format

### ✅ Success (200 OK)
```json
{
  "domain": "example.com",
  "registrar": "Example Registrar, Inc.",
  "creation_date": "1995-08-14",
  "expiration_date": "2025-08-13",
  "name_servers": ["ns1.example.com", "ns2.example.com"],
  "status": ["clientTransferProhibited"],
  "...": "other WHOIS fields"
}
```

### ❌ Error Responses

**Missing domain parameter** (400 Bad Request)
```json
{
  "error": "Domain parameter is required"
}
```

**Method not allowed** (405 Method Not Allowed)
```json
{
  "error": "Method not allowed"
}
```

**Upstream API error** (500 Internal Server Error)
```json
{
  "error": "Failed to fetch WHOIS data",
  "message": "API responded with status 404"
}
```

---

## ⚙️ Configuration

### CORS Settings
Edit the `cors` initialization in your API route:

```javascript
const cors = Cors({
  origin: '*', // 🔒 Change to your domain in production: 'https://yourdomain.com'
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
});
```

> 🔐 **Security Tip**: Always replace `'*'` with your specific frontend domain in production to prevent unauthorized cross-origin access.

### Environment Variables (Optional)
Create a `.env.local` file for future extensibility:

```env
# WHOIS API Base URL (if you want to switch providers)
WHOIS_API_BASE=https://rewhois.com/api

# Allowed origins for CORS (comma-separated)
ALLOWED_ORIGINS=https://yourdomain.com,https://admin.yourdomain.com
```

---

## 🛠️ Project Structure

```
whois-api-proxy/
├── pages/
│   └── api/
│       └── whois.js    # Main API route handler
├── .env.local          # Environment variables (gitignored)
├── package.json        # Project dependencies
├── next.config.js      # Next.js configuration
└── README.md           # This file
```

---

## 🔒 Security & Best Practices

1. **Rate Limiting**: Consider adding Vercel Analytics or a middleware like `@vercel/kv` for request throttling
2. **API Key Protection**: If the upstream API requires authentication, store keys in environment variables
3. **Input Validation**: Sanitize the `domain` parameter to prevent injection attacks
4. **CORS Restriction**: Never use `origin: '*'` in production with sensitive data
5. **Logging**: Add structured logging for monitoring and debugging

---

## 🧪 Testing

```bash
# Test with valid domain
curl "http://localhost:3000/api/whois?domain=github.com"

# Test missing parameter
curl "http://localhost:3000/api/whois"

# Test invalid method
curl -X POST "http://localhost:3000/api/whois?domain=github.com"
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

> 💡 **Pro Tip**: Bookmark your deployed endpoint and use it as a reliable WHOIS lookup service for your apps, dashboards, or automation scripts!

---

*Built with ❤️ using Next.js & Vercel* 🚀