# Security Configuration Guide

## 🔐 Security Features Implemented

Your marketing campaign bot now includes enterprise-grade security:

1. **API Key Authentication** - Protects all campaign endpoints
2. **Rate Limiting** - Prevents abuse and DDoS attacks
3. **Webhook Signature Verification** - Validates Resend webhooks
4. **Security Headers** - Helmet.js protection
5. **CORS Configuration** - Controls allowed origins
6. **Request ID Tracking** - Full audit trail
7. **IP Whitelisting** (optional) - Restrict to specific IPs

---

## ⚙️ Configuration

### 1. Generate Secure API Keys

```bash
# Generate a strong API key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate webhook secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add to `.env`:
```env
API_KEY=a1b2c3d4e5f6...your-64-char-hex-key
WEBHOOK_SECRET=x9y8z7w6v5u4...your-64-char-hex-key
```

### 2. Configure CORS (Cross-Origin Requests)

```env
# Allow all origins (development)
ALLOWED_ORIGINS=*

# Allow specific domains (production)
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

### 3. IP Whitelisting (Optional)

```env
# Allow requests only from these IPs
ALLOWED_IPS=203.0.113.1,203.0.113.2,198.51.100.0

# Leave empty to allow all IPs (default)
ALLOWED_IPS=
```

---

## 🔒 Using the Secured API

### Method 1: X-API-Key Header (Recommended)

```bash
# Trigger campaign
curl -X POST https://your-api.com/api/campaign/trigger \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{"maxRows": 5}'

# Check status
curl https://your-api.com/api/campaign/status \
  -H "X-API-Key: your_api_key_here"
```

### Method 2: Bearer Token (Alternative)

```bash
curl -X POST https://your-api.com/api/campaign/trigger \
  -H "Authorization: Bearer your_api_key_here" \
  -H "Content-Type: application/json"
```

### Using with CLI Script

Update `campaign.sh`:
```bash
# Add at top of file
API_KEY="your_api_key_here"

# Modify curl commands
curl -H "X-API-Key: $API_KEY" "$BASE_URL/api/campaign/status"
```

---

## 📊 Rate Limits

| Endpoint | Limit | Window | Purpose |
|----------|-------|--------|---------|
| **All endpoints** | 100 requests | 15 minutes | General protection |
| **Campaign trigger** | 10 requests | 1 hour | Prevent spam campaigns |
| **Test email** | 5 requests | 5 minutes | Prevent email abuse |
| **Status check** | Unlimited | - | Monitoring allowed |

### Rate Limit Response

When rate limited, you'll receive:
```json
{
  "error": "Too many requests from this IP, please try again later."
}
```

Headers include:
```
RateLimit-Limit: 100
RateLimit-Remaining: 0
RateLimit-Reset: 1699564800
Retry-After: 600
```

---

## 🪝 Webhook Security

### Resend Webhook Setup

1. **Get your webhook secret** from Resend dashboard:
   - Go to https://resend.com/webhooks
   - Create webhook pointing to: `https://your-api.com/webhook/resend`
   - Copy the "Signing Secret"

2. **Add to .env:**
   ```env
   WEBHOOK_SECRET=whsec_your_resend_signing_secret
   ```

3. **Resend will send signature header:**
   ```
   Resend-Signature: v1,timestamp,signature
   ```

The server automatically verifies this using HMAC-SHA256.

### Testing Webhooks Locally

Use Resend's webhook testing tool or ngrok:

```bash
# Install ngrok
brew install ngrok

# Expose local server
ngrok http 3000

# Use the ngrok URL in Resend
https://abc123.ngrok.io/webhook/resend
```

---

## 🛡️ Security Headers (Helmet.js)

Automatically applied headers:

```
Content-Security-Policy: default-src 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=15552000; includeSubDomains
```

These protect against:
- XSS attacks
- Clickjacking
- MIME sniffing
- Man-in-the-middle attacks

---

## 🔍 Request Tracking

Every request gets a unique ID:

```json
{
  "x-request-id": "550e8400-e29b-41d4-a716-446655440000"
}
```

Used for:
- Debugging
- Log correlation
- Audit trails

Check logs:
```bash
grep "550e8400-e29b-41d4-a716-446655440000" logs/app.log
```

---

## ⚠️ Important Security Notes

### Development vs Production

**Development (less strict):**
```env
NODE_ENV=development
API_KEY=  # Empty = authentication disabled
ALLOWED_ORIGINS=*
```

**Production (strict):**
```env
NODE_ENV=production
API_KEY=strong-random-64-char-key
WEBHOOK_SECRET=strong-random-64-char-key
ALLOWED_ORIGINS=https://yourdomain.com
ALLOWED_IPS=203.0.113.1  # Optional
```

### Best Practices

1. ✅ **Never commit .env to git**
   ```bash
   echo ".env" >> .gitignore
   ```

2. ✅ **Rotate API keys regularly** (every 90 days)

3. ✅ **Use environment-specific keys**
   - Different keys for dev/staging/prod

4. ✅ **Monitor failed authentication attempts**
   ```bash
   grep "Invalid API key" logs/app.log
   ```

5. ✅ **Enable HTTPS in production**
   - Use Railway/Render (auto HTTPS)
   - Or setup SSL certificate

6. ✅ **Log all security events**
   - Already implemented in `auth.ts`

---

## 🚨 What If API Key Is Compromised?

1. **Generate new key immediately:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Update in all environments:**
   - Production server
   - Staging server
   - Local .env
   - Cron jobs
   - External services

3. **Rotate webhook secret:**
   - Generate new secret
   - Update Resend webhook settings
   - Update .env

4. **Check logs for suspicious activity:**
   ```bash
   # Failed auth attempts
   grep "Invalid API key" logs/app.log
   
   # Unusual activity
   grep "campaign/trigger" logs/app.log | tail -100
   ```

---

## 📈 Monitoring Security

### Check Authentication Status

```bash
curl https://your-api.com/health
```

Response includes:
```json
{
  "status": "healthy",
  "secured": true  // ← Authentication is enabled
}
```

### Monitor Rate Limits

Check rate limit headers in responses:
```bash
curl -I https://your-api.com/api/campaign/status \
  -H "X-API-Key: your_key"

# Look for:
# RateLimit-Remaining: 95
```

### Security Logs

Watch for security events:
```bash
tail -f logs/app.log | grep -E "Invalid|Unauthorized|Forbidden"
```

---

## 🔧 Troubleshooting

### "Unauthorized" Error

**Problem:** Getting 401 error

**Solutions:**
1. Check API key is set in .env
2. Verify header format: `X-API-Key: your_key`
3. No extra spaces in key
4. Key matches exactly

### "Too many requests" Error

**Problem:** Hit rate limit

**Solutions:**
1. Wait for window to reset (check Retry-After header)
2. Implement exponential backoff
3. Contact admin to increase limits

### Webhook Signature Fails

**Problem:** Webhook returns 403

**Solutions:**
1. Verify WEBHOOK_SECRET matches Resend dashboard
2. Check webhook is coming from Resend IPs
3. Test with Resend's webhook testing tool

---

## 🎯 Production Checklist

Before deploying to production:

- [ ] Set strong API_KEY (64+ chars)
- [ ] Set WEBHOOK_SECRET from Resend
- [ ] Configure ALLOWED_ORIGINS
- [ ] Set NODE_ENV=production
- [ ] Enable HTTPS
- [ ] Test all endpoints with authentication
- [ ] Verify webhooks work
- [ ] Set up monitoring/alerting
- [ ] Document API key rotation process
- [ ] Train team on security practices

---

## 📚 Additional Resources

- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [Resend Webhook Security](https://resend.com/docs/webhooks)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

---

## 🆘 Support

Security concerns? Check logs:
```bash
cat logs/error.log | grep -i security
```

For urgent security issues, rotate keys immediately and investigate.

