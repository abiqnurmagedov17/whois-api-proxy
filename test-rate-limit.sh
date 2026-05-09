#!/bin/bash
# test-rate-limit.sh - Quick rate limit verification

BASE_URL="${1:-http://localhost:3000/api/whois}"
DOMAIN="${2:-test.com}"
TOTAL_REQUESTS=35

echo "🚀 Testing rate limit at $BASE_URL"
echo "📦 Domain: $DOMAIN"
echo "🔢 Requests: $TOTAL_REQUESTS"
echo ""

for i in $(seq 1 $TOTAL_REQUESTS); do
  RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL?domain=$DOMAIN")
  BODY=$(echo "$RESPONSE" | head -n -1)
  STATUS=$(echo "$RESPONSE" | tail -n 1)
  
  if [ "$STATUS" = "429" ]; then
    echo "❌ Request #$i: BLOCKED (429) ✓ Rate limit working!"
    echo "   Response: $(echo $BODY | jq -r '.error // empty')"
    break
  elif [ "$STATUS" = "200" ]; then
    CACHE=$(echo $BODY | jq -r '.cached // "N/A"')
    STALE=$(echo $BODY | jq -r '.warning // empty')
    echo "✅ Request #$i: OK (200) - Cache: $CACHE $STALE"
  else
    echo "⚠️  Request #$i: Status $STATUS"
  fi
  
  # Small delay to avoid overwhelming local server
  sleep 0.1
done

echo ""
echo "📊 Done. Check Redis with:"
echo "   upstash redis zcard rl:ip:YOUR_IP"