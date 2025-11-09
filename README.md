# Marketing Campaign Bot 🚀

An autonomous email campaign bot that personalizes outreach to YouTube creators using AI. The system combines YouTube research, GPT-4 personalization, and automated email delivery with full audit trails.

## Features

- 🎯 **Intelligent Personalization**: Uses GPT-4 to personalize email templates based on YouTube channel research
- 📊 **Infinite Email Columns**: Supports unlimited follow-up sequences with `$EMAIL_1`, `$EMAIL_2`, etc.
- 🔄 **Queue-Based Processing**: BullMQ + Redis for reliable, scalable email delivery
- 📝 **Complete Audit Trail**: Every email is logged with timestamp, message ID, and status
- 🛡️ **Smart Filtering**: Automatic skip for paused contacts and ongoing conversations
- 🌐 **RESTful API**: Webhook endpoints for campaign management
- 📧 **Resend Integration**: Modern email delivery with built-in deliverability
- 🎬 **YouTube Research**: Automatic channel analysis and recent video detection

## Architecture

```
Express Server → Webhook Endpoints → BullMQ Queue → Worker Process
                                          ↓
                      Research Agent → YouTube API + GPT Summary
                                          ↓
                      Personalizer → GPT-4 Template Processing
                                          ↓
                      Email Sender → Resend API
                                          ↓
                      Data Provider → CSV (or Google Sheets)
```

## Quick Start

### Prerequisites

- Node.js 18+ (or 20+)
- Redis server (local or remote)
- API Keys:
  - Resend API key
  - OpenAI API key
  - YouTube Data API key (optional but recommended)

### Installation

1. **Clone and install dependencies**:

```bash
git clone <your-repo-url>
cd marketing-agents
npm install
```

2. **Set up environment variables**:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# API Keys (REQUIRED)
RESEND_API_KEY=re_xxxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxxx
YOUTUBE_API_KEY=AIzaSyxxxxxxxxxx

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# Bot Configuration
BOT_NAME=ReplyFanBot
CAMPAIGN_CONCURRENCY=5
```

3. **Start Redis** (if running locally):

```bash
# macOS (Homebrew)
brew services start redis

# Linux
sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 redis:alpine
```

4. **Build the project**:

```bash
npm run build
```

### Running the System

You need to run **two processes**:

#### Terminal 1: API Server

```bash
npm run dev
# or for production: npm start
```

Server will start on `http://localhost:3000`

#### Terminal 2: Worker Process

```bash
npm run dev:worker
# or for production: npm run start:worker
```

Worker will process jobs from the queue.

## Usage

### 1. Test Your Setup

Send a test email to verify configuration:

```bash
curl -X POST http://localhost:3000/api/test/email \
  -H "Content-Type: application/json" \
  -d '{"to": "your-email@example.com"}'
```

### 2. Trigger a Campaign

Process all contacts in the CSV:

```bash
curl -X POST http://localhost:3000/api/campaign/trigger
```

Limit to first 5 rows:

```bash
curl -X POST http://localhost:3000/api/campaign/trigger \
  -H "Content-Type: application/json" \
  -d '{"maxRows": 5}'
```

### 3. Process a Single Contact

```bash
curl -X POST http://localhost:3000/api/campaign/process-row/1
```

### 4. Check Queue Status

```bash
curl http://localhost:3000/api/campaign/status
```

### 5. Clear the Queue

```bash
curl -X POST http://localhost:3000/api/campaign/clear-queue
```

## Data Management

### CSV Structure

The system uses `data/contacts.csv` with the following columns:

| Column | Type | Description |
|--------|------|-------------|
| `Name` | string | Creator's name |
| `Niche` | string | Channel niche (Fitness, Tech, etc.) |
| `YT Link` | string | YouTube channel URL |
| `YT Followers` | number | Subscriber count |
| `Website` | string | Creator's website |
| `Email Address` | string | Contact email |
| `IS_Sent` | boolean | TRUE if any email sent |
| `Sent_by` | string | Bot name |
| `EMAIL_TEMPLATE-1` | string | Template version used |
| `PAUSE` | boolean | Global pause flag |
| `$IN_TALKS` | boolean | Skip if actively discussing |
| `$EMAIL_1` | string | First email log entry |
| `$EMAIL_2` | string | Second email log entry |
| `$EMAIL_3` | string | Third email log entry |
| `NOTES` | string | Human notes |

### Email Log Format

Each `$EMAIL_n` cell contains:

```
2025-11-08T14:23:11Z | msg_9x8y7z | email_1 | SENT | Subject: Quick question about Motivation content
```

### Pausing Campaigns

Set `PAUSE=TRUE` to skip a contact temporarily.
Set `$IN_TALKS=TRUE` when actively in conversation with a creator.

## Email Templates

Templates are located in `src/templates/` and support two types of placeholders:

### Static Placeholders

Replaced with values from the CSV:

- `[NAME]` → Contact's name
- `[NICHE]` → Channel niche
- `[WEBSITE]` → Creator's website
- `[YT_LINK]` → YouTube channel URL
- `[YT_FOLLOWERS]` → Subscriber count

### GPT Placeholders

AI-generated content based on research:

```
{{Write a personalized 2-sentence intro referencing their recent videos}}
```

The system will research the channel and generate contextual content.

### Example Template

```
Subject: Quick question about [NICHE] content

Hi [NAME],

{{Write a personalized intro that references their channel}}

I came across your channel while researching creators in the [NICHE] space.

{{Mention one specific recent video title}}

Would you be open to a quick call this week?

Best,
ReplyFan Team
```

## API Endpoints

### Campaign Management

- `POST /api/campaign/trigger` - Start full campaign
- `POST /api/campaign/process-row/:rowId` - Process specific row
- `GET /api/campaign/status` - Get queue statistics
- `POST /api/campaign/clear-queue` - Clear all pending jobs

### Testing

- `POST /api/test/email` - Send test email
- `GET /health` - Health check

### Webhooks

- `POST /webhook/resend` - Resend delivery events

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RESEND_API_KEY` | Yes | - | Resend API key |
| `OPENAI_API_KEY` | Yes | - | OpenAI API key |
| `YOUTUBE_API_KEY` | Recommended | - | YouTube Data API key |
| `REDIS_HOST` | Yes | localhost | Redis host |
| `REDIS_PORT` | No | 6379 | Redis port |
| `DATA_PROVIDER` | No | csv | `csv` or `sheets` |
| `CAMPAIGN_CONCURRENCY` | No | 5 | Concurrent workers |
| `MAX_EMAILS_PER_RUN` | No | 50 | Max emails per campaign |
| `EMAIL_SEND_DELAY_MS` | No | 1000 | Delay between sends |

### Switching to Google Sheets

1. Set up Google Cloud project and enable Sheets API
2. Download service account credentials JSON
3. Update `.env`:

```env
DATA_PROVIDER=sheets
GOOGLE_SHEETS_ID=your_spreadsheet_id
GOOGLE_SERVICE_ACCOUNT_PATH=./credentials.json
```

4. Implement the full `GoogleSheetsProvider` (currently a stub)

## Development

### Project Structure

```
src/
├── lib/
│   ├── config.ts              # Configuration loader
│   ├── logger.ts              # Winston logger
│   ├── dataProvider.ts        # Abstract interface
│   ├── csvDataProvider.ts     # CSV implementation
│   ├── researchAgent.ts       # YouTube + GPT research
│   ├── personalizer.ts        # Email personalization
│   ├── resend.ts              # Email sending
│   └── campaignRunner.ts      # Campaign orchestration
├── utils/
│   ├── columnHelper.ts        # $EMAIL_n utilities
│   └── templateRenderer.ts    # Template processing
├── workers/
│   └── campaignWorker.ts      # BullMQ job processor
├── templates/
│   ├── email_1.txt            # First touchpoint
│   ├── email_2.txt            # Follow-up
│   └── email_3.txt            # Final follow-up
├── types/
│   └── index.ts               # TypeScript types
├── server.ts                  # Express app
├── index.ts                   # Server entry point
└── worker.ts                  # Worker entry point
```

### Scripts

- `npm run dev` - Start server in dev mode
- `npm run dev:worker` - Start worker in dev mode
- `npm run build` - Compile TypeScript
- `npm start` - Start production server
- `npm run start:worker` - Start production worker
- `npm run type-check` - Type checking without build

## Monitoring & Debugging

### Logs

Logs are written to:
- `logs/app.log` - All application logs
- `logs/error.log` - Error logs only
- Console output in development mode

### Queue Monitoring

Check job status:

```bash
curl http://localhost:3000/api/campaign/status
```

Response:

```json
{
  "success": true,
  "queue": {
    "waiting": 3,
    "active": 2,
    "completed": 10,
    "failed": 0,
    "total": 15
  }
}
```

## Troubleshooting

### Common Issues

**Redis Connection Error**

```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG
```

**YouTube API Quota Exceeded**

The system will fall back to basic data if quota is exceeded. Consider:
- Using API key with higher quota
- Implementing result caching (already built-in for 1 hour)

**Resend Rate Limiting**

Free tier: 100 emails/day. Upgrade or adjust:

```env
EMAIL_SEND_DELAY_MS=2000  # Increase delay
MAX_EMAILS_PER_RUN=10     # Reduce batch size
```

**Template Not Found**

Ensure templates exist in `src/templates/`:
- `email_1.txt`
- `email_2.txt`
- `email_3.txt`

## Production Deployment

### Recommended Setup

1. **Use a process manager** (PM2, systemd):

```bash
# PM2 example
pm2 start npm --name "campaign-server" -- start
pm2 start npm --name "campaign-worker" -- run start:worker
pm2 save
```

2. **Set up Redis persistence**:

```bash
# In redis.conf
save 900 1
save 300 10
save 60 10000
```

3. **Configure Resend webhooks**:

Point to: `https://yourdomain.com/webhook/resend`

4. **Monitor logs** with log aggregation (Datadog, LogDNA, etc.)

5. **Set up alerts** for failed jobs

### Security Considerations

- Never commit `.env` files
- Use environment variables in production
- Rotate API keys regularly
- Implement rate limiting on webhooks
- Validate webhook signatures from Resend

## Roadmap

- [ ] Google Sheets full implementation
- [ ] Bull Board dashboard integration
- [ ] A/B testing for email templates
- [ ] Reply detection and auto-pause
- [ ] Engagement metrics dashboard
- [ ] Email warmup sequence
- [ ] Multi-workspace support

## License

MIT

## Support

For issues and questions:
- Check logs in `logs/` directory
- Review API endpoint responses
- Verify environment variables
- Test with small batches first

---

**Built with:** TypeScript, Express, BullMQ, Resend, OpenAI GPT-4, YouTube API

