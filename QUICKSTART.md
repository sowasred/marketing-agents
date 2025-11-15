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

## Data Provider Setup

Choose either **CSV** (default) or **Google Sheets** for storing contacts.

### Option A: CSV (Default)

No additional setup needed. Contacts are stored in `data/contacts.csv`.

### Option B: Google Sheets

#### Step 1: Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project or select existing one
3. Enable **Google Sheets API**:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click "Enable"

#### Step 2: Create Service Account

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Name it (e.g., `marketing-agents`)
4. Click "Create and Continue" > "Done"

#### Step 3: Download Credentials

1. Click on the service account
2. Go to "Keys" tab > "Add Key" > "Create new key"
3. Select **JSON** format
4. Save as `credentials.json` in project root

#### Step 4: Create Google Sheet

1. Create a new Google Sheet
2. Add headers in row 1:
   ```
   name, niche, yt_link, yt_followers, website, email_address, is_sent, sent_by, email_template_1, pause, $in_talks, notes
   ```
3. Add test data rows
4. **Share the sheet** with the service account email (from `credentials.json`):
   - Click "Share" button
   - Paste service account email (found in `credentials.json` as `client_email`)
   - Give "Editor" permission
   - Click "Send"
5. Copy the **Sheet ID** from URL:
   - URL: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`
   - Copy the `SHEET_ID_HERE` part

#### Step 5: Configure Environment

Add to your `.env` file:

```env
DATA_PROVIDER=sheets
GOOGLE_SHEETS_ID=your_sheet_id_here
GOOGLE_SERVICE_ACCOUNT_PATH=./credentials.json
```

#### Step 6: Test Google Sheets Connection

```bash
npm run build
node src/tests/test-sheets.js
```

Expected output:
```
✅ Loaded X rows
✅ Row 1: {...}
✅ Row updated
✅ Column added
✅ All tests passed!
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

### 1. Check System Health

```bash
curl http://localhost:3000/health
```

Should show `dataProvider: "csv"` or `dataProvider: "sheets"` based on your config.

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-13T14:23:11Z",
  "environment": "development",
  "botName": "ReplyFanBot",
  "dataProvider": "csv",
  "secured": false
}
```

### 2. Send Test Email

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
    "status": "SENT"
  }
}
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

## Running Campaigns

### Process One Contact

<!-- Q: Do we need api key for sheets? -->
```bash
curl -X POST http://localhost:3000/api/campaign/process-row/1 \
  -H "X-API-Key: your-api-key"
```

This will:
- ✅ Research the YouTube channel
- ✅ Personalize the email template
- ✅ Send the email via Resend
- ✅ Update contact in CSV/Sheets

### Run Limited Campaign

```bash
curl -X POST http://localhost:3000/api/campaign/trigger \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"maxRows": 2}'
```

This processes the first 2 non-paused contacts.

### Run Full Campaign

```bash
curl -X POST http://localhost:3000/api/campaign/trigger \
  -H "X-API-Key: your-api-key"
```

⚠️ **Warning**: This processes ALL non-paused contacts.

## Viewing Results

### CSV Provider

Check `data/contacts.csv`. After a campaign, you'll see:

```csv
Name,Niche,...,$EMAIL_1
Alex Motivation,Motivation,...,"2025-11-08T14:23:11Z | msg_abc123 | email_1 | SENT | Subject: ..."
```

### Google Sheets Provider

Open your Google Sheet. Updates appear in real-time:
- `is_sent` column set to `TRUE`
- `sent_by` column shows bot name
- `$EMAIL_1` (or next available) column contains log entry

## Managing Contacts

### Pause a Contact

**CSV**: Edit `data/contacts.csv` and set `pause=TRUE`

**Google Sheets**: Set `pause` column to `TRUE` in the sheet

### Mark as "In Talks"

**CSV**: Set `$in_talks=TRUE` in CSV

**Google Sheets**: Set `$in_talks` column to `TRUE` in the sheet

Both paused and in-talks contacts are automatically skipped.

## Monitoring

### Watch Logs

```bash
# Application logs
tail -f logs/app.log

# Error logs only
tail -f logs/error.log
```

### Check Queue Status

```bash
watch -n 2 'curl -s http://localhost:3000/api/campaign/status | jq'
```

## Troubleshooting

### Redis Connection Refused

**Problem**: Redis isn't running

**Solution**:
```bash
brew services start redis
# or
redis-server
```

### API Key Not Configured

**Problem**: Missing API key in `.env`

**Solution**: Edit `.env` and add the required key

### YouTube API Quota Exceeded

**Problem**: Hit daily quota (10,000 units)

**Solution**: System falls back to basic data. No action needed.

### Worker Not Processing Jobs

**Problem**: Worker process not running

**Solution**: Start worker in second terminal:
```bash
npm run dev:worker
```

### Google Sheets Authentication Error

**Problem**: Service account can't access sheet

**Solution**:
1. Verify `credentials.json` exists and is valid
2. Check that sheet is shared with service account email
3. Ensure service account has "Editor" permission
4. Verify `GOOGLE_SHEETS_ID` in `.env` is correct

### Google Sheets Not Updating

**Problem**: Changes not appearing in sheet

**Solution**:
1. Check logs for errors: `tail -f logs/error.log`
2. Verify sheet ID is correct
3. Ensure service account has write permissions
4. Check that sheet name matches (uses first sheet by default)

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
- Add more contacts to your data source
- Set up webhooks for delivery tracking
- Review [DEVELOPMENT.md](./DEVELOPMENT.md) for architecture details

## Need Help?

Check the logs:
```bash
cat logs/error.log
```

The logs will show exactly what went wrong and on which step.
