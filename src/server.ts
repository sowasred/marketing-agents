import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { runCampaign, processSingleRow, getQueueStats, clearQueue } from './lib/campaignRunner.js';
import { sendTestEmail } from './lib/resend.js';
import { requireApiKey, verifyResendWebhook, addRequestId } from './lib/auth.js';
import config from './lib/config.js';
import logger from './lib/logger.js';

const app = express();

// Security Middleware
app.use(helmet()); // Adds security headers
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
}));

// Rate Limiting
const generalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000 * 6, // 6 hours
  max: 5, // Limit each IP to 1 request per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const campaignLimiter = rateLimit({
  windowMs: 60 * 60 * 1000 * 6, // 6 hours
  max: 5, // Limit campaign triggers to 1 per 6 hours
  message: 'Too many campaign triggers, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const testEmailLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // Max 5 test emails per 5 minutes
  message: 'Too many test emails, please try again later.',
});

// Apply rate limiting to all routes
app.use(generalLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request ID and logging
app.use(addRequestId);
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`, {
    requestId: req.headers['x-request-id'],
    ip: req.ip,
  });
  next();
});

/**
 * Health check endpoint (public, no auth required)
 */
app.get('/health', (_req: Request, res: Response) => {
  return res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    botName: config.bot.name,
    secured: !!config.apiKey,
  });
});

/**
 * Trigger full campaign
 * POST /api/campaign/trigger
 * Body: { maxRows?: number }
 * Requires: X-API-Key header
 */
app.post('/api/campaign/trigger', requireApiKey, campaignLimiter, async (req: Request, res: Response) => {
  try {
    logger.info('Campaign trigger requested');
    
    const { maxRows } = req.body;
    
    // Run campaign asynchronously
    const stats = await runCampaign(maxRows);
    
    return res.json({
      success: true,
      message: 'Campaign triggered successfully',
      stats,
    });
  } catch (error: any) {
    logger.error('Error triggering campaign:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Process a specific row
 * POST /api/campaign/process-row/:rowId
 * Requires: X-API-Key header
 */
app.post('/api/campaign/process-row/:rowId', requireApiKey, async (req: Request, res: Response) => {
  try {
    const rowId = parseInt(req.params.rowId, 10);
    
    if (isNaN(rowId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid row ID',
      });
    }
    
    logger.info(`Processing single row: ${rowId}`);
    
    const stats = await processSingleRow(rowId);
    
    return res.json({
      success: true,
      message: `Row ${rowId} processed`,
      stats,
    });
  } catch (error: any) {
    logger.error(`Error processing row ${req.params.rowId}:`, error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get queue status
 * GET /api/campaign/status
 * Requires: X-API-Key header
 */
app.get('/api/campaign/status', requireApiKey, async (_req: Request, res: Response) => {
  try {
    const stats = await getQueueStats();
    
    return res.json({
      success: true,
      queue: stats,
      config: {
        concurrency: config.bot.campaignConcurrency,
        maxEmailsPerRun: config.bot.maxEmailsPerRun,
        emailDelayMs: config.bot.emailSendDelayMs,
      },
    });
  } catch (error: any) {
    logger.error('Error getting queue status:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Clear the queue
 * POST /api/campaign/clear-queue
 * Requires: X-API-Key header
 */
app.post('/api/campaign/clear-queue', requireApiKey, async (_req: Request, res: Response) => {
  try {
    await clearQueue();
    
    return res.json({
      success: true,
      message: 'Queue cleared successfully',
    });
  } catch (error: any) {
    logger.error('Error clearing queue:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Send test email
 * POST /api/test/email
 * Body: { to: string }
 * Requires: X-API-Key header
 */
app.post('/api/test/email', requireApiKey, testEmailLimiter, async (req: Request, res: Response) => {
  try {
    const { to } = req.body;
    
    if (!to) {
      return res.status(400).json({
        success: false,
        error: 'Email address required',
      });
    }
    
    logger.info(`Sending test email to: ${to}`);
    
    const result = await sendTestEmail(to);
    
    return res.json({
      success: result.status === 'SENT',
      message: result.status === 'SENT' ? 'Test email sent' : 'Failed to send test email',
      result,
    });
  } catch (error: any) {
    logger.error('Error sending test email:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Webhook endpoint for Resend events
 * POST /webhook/resend
 * Requires: Valid Resend signature
 */
app.post('/webhook/resend', verifyResendWebhook, async (req: Request, res: Response) => {
  try {
    const event = req.body;
    
    logger.info('Received Resend webhook:', {
      type: event.type,
      emailId: event.data?.email_id,
    });
    
    // Handle different event types
    switch (event.type) {
      case 'email.sent':
        logger.info(`Email sent: ${event.data.email_id}`);
        break;
      
      case 'email.delivered':
        logger.info(`Email delivered: ${event.data.email_id}`);
        break;
      
      case 'email.delivery_delayed':
        logger.warn(`Email delivery delayed: ${event.data.email_id}`);
        break;
      
      case 'email.bounced':
        logger.error(`Email bounced: ${event.data.email_id}`);
        // TODO: Update row status in spreadsheet
        break;
      
      case 'email.opened':
        logger.info(`Email opened: ${event.data.email_id}`);
        break;
      
      case 'email.clicked':
        logger.info(`Email link clicked: ${event.data.email_id}`);
        break;
      
      default:
        logger.info(`Unknown webhook event: ${event.type}`);
    }
    
    // Always return 200 to acknowledge receipt
    return res.status(200).json({ received: true });
  } catch (error: any) {
    logger.error('Error processing webhook:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  return res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
  });
});

/**
 * Error handler
 */
app.use((err: Error, _req: Request, res: Response) => {
  logger.error('Unhandled error:', err);
  return res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

/**
 * Start the server
 */
export function startServer(): void {
  app.listen(config.port, () => {
    logger.info(`Server started on port ${config.port}`);
    logger.info(`Environment: ${config.nodeEnv}`);
    logger.info(`Bot name: ${config.bot.name}`);
    logger.info(`Data provider: ${config.dataProvider}`);
    logger.info('Available endpoints:');
    logger.info('  GET  /health');
    logger.info('  POST /api/campaign/trigger');
    logger.info('  POST /api/campaign/process-row/:rowId');
    logger.info('  GET  /api/campaign/status');
    logger.info('  POST /api/campaign/clear-queue');
    logger.info('  POST /api/test/email');
    logger.info('  POST /webhook/resend');
  });
}

export default app;

