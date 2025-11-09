# Development Guide

## Project Overview

This is a complete autonomous email campaign system with the following architecture:

```
┌─────────────────┐
│  Express Server │  ← HTTP/Webhook endpoints
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  BullMQ Queue   │  ← Job queue (Redis-backed)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Worker Process │  ← Processes jobs concurrently
└────────┬────────┘
         │
         ▼
    ┌────┴─────┬───────────┬──────────┐
    ▼          ▼           ▼          ▼
Research   Personalizer  Resend   DataProvider
 Agent       (GPT-4)      API      (CSV/Sheets)
```

## Key Components

### 1. Data Layer (`src/lib/dataProvider.ts`, `csvDataProvider.ts`)

**Purpose**: Abstraction for reading/writing contact data

**Interface**:
- `getRows()` - Load all contacts
- `getRow(id)` - Load specific contact
- `updateRow(id, data)` - Update contact
- `addColumn(name)` - Add new $EMAIL_n column

**Implementations**:
- ✅ CSV (fully implemented)
- 🚧 Google Sheets (stub, needs implementation)

**To implement Google Sheets**:
```typescript
// In googleSheetsProvider.ts
import { google } from 'googleapis';

const auth = new google.auth.GoogleAuth({
  keyFile: credentialsPath,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

// Use sheets.spreadsheets.values.get/update
```

### 2. Template System (`src/utils/templateRenderer.ts`)

**Two-tier placeholder system**:

1. **Static placeholders** - Direct substitution from CSV
   - `[NAME]`, `[NICHE]`, `[WEBSITE]`, etc.
   - Replaced before GPT processing

2. **GPT placeholders** - AI-generated content
   - `{{instruction for GPT}}`
   - Each processed individually with full context

**Flow**:
```
Template → Replace [STATIC] → Extract {{GPT}} → Generate content → Final email
```

### 3. Research Agent (`src/lib/researchAgent.ts`)

**Purpose**: Gather intelligence on YouTube channels

**Process**:
1. Extract channel ID from URL
2. Fetch channel info via YouTube API
3. Get 5 most recent videos
4. Generate 2-3 sentence summary with GPT
5. Cache for 1 hour

**Caching**: In-memory Map with TTL (1 hour)

**Fallback**: If YouTube API fails, returns generic summary

### 4. Personalizer (`src/lib/personalizer.ts`)

**Purpose**: Transform templates into personalized emails

**Process**:
1. Load template file
2. Replace static placeholders
3. Extract GPT instructions
4. For each instruction:
   - Create context (name, niche, research)
   - Generate content via GPT-4-mini
   - Replace placeholder
5. Parse subject and body
6. Convert to HTML

**Key function**: `personalize(templateName, row, research)`

### 5. Campaign Runner (`src/lib/campaignRunner.ts`)

**Purpose**: Orchestrate campaign execution

**Main functions**:
- `runCampaign(maxRows?)` - Process all eligible contacts
- `processSingleRow(rowId)` - Process specific contact
- `getQueueStats()` - Get queue metrics

**Logic**:
```typescript
for (const row of contacts) {
  if (shouldSkip(row)) continue;
  
  // Add job to queue (non-blocking)
  await emailQueue.add('process-row', {
    type: JobType.PROCESS_ROW,
    rowNumber: row._rowNumber,
    rowData: row,
  });
}
```

### 6. BullMQ Worker (`src/workers/campaignWorker.ts`)

**Purpose**: Process queued jobs asynchronously

**Job types**:
- `PROCESS_ROW` - Full flow (research → personalize → send)
- `SEND_EMAIL` - Just send (for pre-personalized)

**Concurrency**: Configured via `CAMPAIGN_CONCURRENCY` (default: 5)

**Retry logic**: 3 attempts with exponential backoff

**Process**:
```typescript
async function processRowJob(job) {
  1. Find next empty $EMAIL_n column
  2. Get research data
  3. Personalize template
  4. Send via Resend
  5. Log to spreadsheet
}
```

## Adding New Features

### Add a New Email Template

1. Create `src/templates/email_4.txt`
2. Use `[STATIC]` and `{{GPT}}` placeholders
3. System automatically discovers it based on column naming

### Add New Static Placeholder

Edit `src/utils/templateRenderer.ts`:

```typescript
// In replaceStaticPlaceholders()
result = result.replace(/\[YOUR_COLUMN\]/g, row['YourColumn'] || '');
```

### Add Custom Research Source

Edit `src/lib/researchAgent.ts`:

```typescript
// After YouTube research
const twitterData = await fetchTwitterData(handle);
research.twitterFollowers = twitterData.followers;

// Include in GPT summary prompt
```

### Implement Webhook Event Handling

Edit `src/server.ts` in `/webhook/resend`:

```typescript
case 'email.bounced':
  const dataProvider = getDataProvider();
  await dataProvider.updateRow(rowNumber, {
    BOUNCE_STATUS: 'BOUNCED',
    BOUNCE_REASON: event.data.reason,
  });
  break;
```

### Add A/B Testing

1. Add column `EMAIL_TEMPLATE-1` to specify variant
2. Create multiple templates: `email_1_variant_a.txt`, `email_1_variant_b.txt`
3. Modify `getTemplateNameFromColumn()` to include variant

### Add Rate Limiting

Edit `src/workers/campaignWorker.ts`:

```typescript
const worker = new Worker('email-campaign', processJob, {
  connection: redisConnection,
  concurrency: config.bot.campaignConcurrency,
  limiter: {
    max: 10,      // Max 10 jobs
    duration: 60000, // Per minute
  },
});
```

## Environment-Specific Behavior

### Development (`NODE_ENV=development`)
- Console logging enabled
- Verbose debug logs
- Hot reload with `tsx watch`

### Production (`NODE_ENV=production`)
- File logging only
- Info level and above
- Compiled JS execution

## Testing Strategy

### Unit Tests (to be implemented)

```typescript
// Example: Test column helper
describe('findNextEmptyEmailColumn', () => {
  it('should find first empty column', () => {
    const row = {
      $EMAIL_1: 'filled',
      $EMAIL_2: '',
      $EMAIL_3: 'filled',
    };
    expect(findNextEmptyEmailColumn(row)).toBe('$EMAIL_2');
  });
});
```

### Integration Tests

```bash
# Test full flow with mock data
curl -X POST http://localhost:3000/api/campaign/process-row/1
# Check logs and CSV for results
```

### End-to-End Tests

```bash
# Trigger small campaign
curl -X POST http://localhost:3000/api/campaign/trigger \
  -d '{"maxRows": 1}'
# Verify email received
```

## Debugging Tips

### Enable Debug Logging

Edit `src/lib/logger.ts`:

```typescript
const logger = winston.createLogger({
  level: 'debug', // Was 'info'
  // ...
});
```

### Inspect Redis Queue

```bash
# Connect to Redis
redis-cli

# See all keys
KEYS *

# View queue jobs
LRANGE bull:email-campaign:wait 0 -1
```

### Monitor Worker Performance

Add metrics:

```typescript
// In worker
let processedCount = 0;
worker.on('completed', () => {
  processedCount++;
  if (processedCount % 10 === 0) {
    logger.info(`Processed ${processedCount} jobs`);
  }
});
```

## Performance Optimization

### Current Limits

- **Concurrency**: 5 workers (configurable)
- **Rate limit**: 10 jobs/minute (configurable)
- **Delay**: 1000ms between sends (configurable)

### Scaling Up

1. **Increase concurrency**:
   ```env
   CAMPAIGN_CONCURRENCY=10
   ```

2. **Add more worker instances**:
   ```bash
   # Run multiple workers on different servers
   npm run start:worker
   ```

3. **Use Redis Cluster** for high availability

4. **Implement job prioritization**:
   ```typescript
   await emailQueue.add('process-row', data, {
     priority: row.importance, // Higher = processed first
   });
   ```

## Common Patterns

### Graceful Shutdown

```typescript
process.on('SIGTERM', async () => {
  logger.info('Shutting down...');
  await worker.close(); // Finish current jobs
  await queue.close();
  process.exit(0);
});
```

### Idempotent Operations

```typescript
// Use unique job IDs to prevent duplicates
await emailQueue.add('process-row', data, {
  jobId: `row-${rowNumber}-${timestamp}`,
});
```

### Error Recovery

```typescript
worker.on('failed', async (job, error) => {
  if (job.attemptsMade >= 3) {
    // Max retries reached
    await dataProvider.updateRow(job.data.rowNumber, {
      ERROR: error.message,
      STATUS: 'FAILED',
    });
  }
});
```

## Future Enhancements

### Priority 1
- [ ] Google Sheets full implementation
- [ ] Reply detection (IMAP/Gmail API)
- [ ] Auto-pause on reply
- [ ] Email open tracking

### Priority 2
- [ ] Bull Board dashboard
- [ ] A/B test analytics
- [ ] Custom field support
- [ ] Template versioning

### Priority 3
- [ ] Multi-language support
- [ ] Schedule campaigns
- [ ] Drip sequences
- [ ] CRM integration

## Contributing Guidelines

1. **Follow TypeScript strict mode**
2. **Add logging** for important operations
3. **Handle errors gracefully** with fallbacks
4. **Update types** in `src/types/index.ts`
5. **Document new env vars** in `.env.example`
6. **Test with small datasets** first

## Useful Commands

```bash
# Type check without building
npm run type-check

# Watch mode for development
npm run dev & npm run dev:worker

# Check Redis status
redis-cli ping

# View logs in real-time
tail -f logs/app.log | jq

# Test specific row
./campaign.sh process-row 1

# Monitor queue
watch -n 2 './campaign.sh status'
```

## Architecture Decisions

### Why BullMQ?
- Redis-backed persistence
- Automatic retries
- Job prioritization
- Horizontal scaling
- Active development

### Why CSV over DB?
- Simple setup
- Human-readable
- Git-friendly for small datasets
- Easy migration to Sheets

### Why Resend over SendGrid?
- Modern API
- Better deliverability
- Simpler pricing
- Webhook support

### Why GPT-4-mini?
- Cost-effective ($0.15/1M tokens)
- Fast response time
- Good quality for personalization
- Lower than GPT-4 but sufficient

## Support & Resources

- **Logs**: `logs/app.log`, `logs/error.log`
- **Config**: `.env` and `src/lib/config.ts`
- **Queue UI**: Consider adding Bull Board
- **Monitoring**: Integrate with Datadog/New Relic

## License

MIT - Feel free to modify and extend!

