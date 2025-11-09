# Quick Start Guide

## Setup (5 minutes)

1. **Install dependencies and build**:
```bash
./setup.sh
# or manually:
# npm install && npm run build
```

2. **Configure API keys in `.env`**:
```bash
# Required
RESEND_API_KEY=re_your_key_here
OPENAI_API_KEY=sk-your_key_here
YOUTUBE_API_KEY=AIza_your_key_here

# Redis (if remote)
REDIS_HOST=localhost
REDIS_PORT=6379
```

3. **Start Redis** (if not already running):
```bash
# macOS
brew services start redis

# Linux
sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 redis:alpine
```

## Running the Bot

### Development Mode (Recommended)

**Terminal 1 - API Server:**
```bash
npm run dev
```

**Terminal 2 - Worker Process:**
```bash
npm run dev:worker
```

### Production Mode

```bash
# Build first
npm run build

# Terminal 1
npm start

# Terminal 2
npm run start:worker
```

## Testing the System

### 1. Send a Test Email

```bash
curl -X POST http://localhost:3000/api/test/email \
  -H "Content-Type: application/json" \
  -d '{"to": "your-email@example.com"}'
```

Expected response:
```json
{
  "success": true,
  "message": "Test email sent",
  "result": {
    "messageId": "msg_xyz...",
    "timestamp": "2025-11-08T...",
    "status": "SENT"
  }
}
```

### 2. Check System Health

```bash
curl http://localhost:3000/health
```

### 3. Check Queue Status

```bash
curl http://localhost:3000/api/campaign/status
```

Expected response:
```json
{
  "success": true,
  "queue": {
    "waiting": 0,
    "active": 0,
    "completed": 0,
    "failed": 0,
    "total": 0
  }
}
```

## Running Your First Campaign

### Option 1: Process One Contact

```bash
curl -X POST http://localhost:3000/api/campaign/process-row/1
```

This will:
- ✅ Research the YouTube channel
- ✅ Personalize the email template
- ✅ Send the email via Resend
- ✅ Log result to CSV

### Option 2: Run Full Campaign (Limited)

```bash
curl -X POST http://localhost:3000/api/campaign/trigger \
  -H "Content-Type: application/json" \
  -d '{"maxRows": 2}'
```

This processes the first 2 non-paused contacts.

### Option 3: Run Full Campaign (All Contacts)

```bash
curl -X POST http://localhost:3000/api/campaign/trigger
```

⚠️ **Important**: This will process ALL contacts in `data/contacts.csv` that aren't paused.

## Viewing Results

Check your `data/contacts.csv` file. After running a campaign, you'll see:

```csv
Name,Niche,...,$EMAIL_1
Alex Motivation,Motivation,...,"2025-11-08T14:23:11Z | msg_abc123 | email_1 | SENT | Subject: Quick question..."
```

## Common Issues & Solutions

### "Redis connection refused"

**Problem**: Redis isn't running

**Solution**:
```bash
# Start Redis
brew services start redis
# or
redis-server
```

### "RESEND_API_KEY not configured"

**Problem**: Missing API key

**Solution**: Edit `.env` and add your Resend API key

### "YouTube API quota exceeded"

**Problem**: Hit daily quota (10,000 units)

**Solution**: System falls back to basic data. No action needed, or increase quota.

### Worker not processing jobs

**Problem**: Worker process not running

**Solution**: Open second terminal and run:
```bash
npm run dev:worker
```

## Monitoring

### Watch Logs in Real-Time

```bash
# Application logs
tail -f logs/app.log

# Error logs only
tail -f logs/error.log
```

### Check What's in the Queue

```bash
watch -n 2 'curl -s http://localhost:3000/api/campaign/status | jq'
```

## Managing Contacts

### Pause a Contact

Edit `data/contacts.csv` and set `PAUSE=TRUE`:

```csv
John Tech,Technology,...,TRUE,FALSE,...
```

### Mark as "In Talks"

Set `$IN_TALKS=TRUE` to skip while in active conversation:

```csv
Mike Gaming,Gaming,...,FALSE,TRUE,...
```

Both paused and in-talks contacts are automatically skipped.

## Tips for Success

1. **Start Small**: Test with 1-2 contacts first
2. **Check Your Email**: Verify test emails arrive and look good
3. **Monitor Logs**: Watch for errors in real-time
4. **Respect Limits**: 
   - Resend free tier: 100 emails/day
   - YouTube API: 10,000 units/day
5. **Customize Templates**: Edit files in `src/templates/` to match your voice

## Next Steps

- Read the full [README.md](./README.md) for advanced configuration
- Customize email templates in `src/templates/`
- Add more contacts to `data/contacts.csv`
- Set up webhooks for delivery tracking
- Consider upgrading to Google Sheets for collaboration

## Need Help?

Check the logs:
```bash
cat logs/error.log
```

The logs will show exactly what went wrong and on which step.

