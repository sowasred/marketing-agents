import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import {
  JobData,
  JobType,
  ProcessRowJobData,
  SendEmailJobData,
} from '../types/index.js';
import { getDataProvider } from '../lib/campaignRunner.js';
import { getResearch, getWebsiteResearch } from '../lib/researchAgent.js';
import { personalize } from '../lib/personalizer.js';
import { sendEmail, validateEmail } from '../lib/resend.js';
import {
  findNextEmptyEmailColumn,
  getTemplateNameFromColumn,
  formatEmailLogEntry,
} from '../utils/columnHelper.js';
import config from '../lib/config.js';
import logger from '../lib/logger.js';

// Initialize Redis connection for worker
const redisConnection = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null,
  tls: process.env.REDIS_TLS === 'false' ? undefined : {}, // Enable TLS by default for Upstash/cloud Redis
});

/**
 * Processes a PROCESS_ROW job: research, personalize, and send email
 */
async function processRowJob(job: Job<ProcessRowJobData>): Promise<void> {
  const { rowNumber, rowData } = job.data;

  logger.info(`Processing row ${rowNumber}: ${rowData.name}`);

  const dataProvider = getDataProvider();

  try {
    // Find next empty email column
    const nextColumn = findNextEmptyEmailColumn(rowData);

    if (!nextColumn) {
      logger.warn(`No empty email column found for row ${rowNumber}`);
      return;
    }
    // Determine template name
    const templateName = getTemplateNameFromColumn(nextColumn);
    logger.info(`Using template ${templateName} for row ${rowNumber}`);

    // Get research data
    await job.updateProgress(25);
    let research;
    // TODO: Turn all research related logic into getResearch function.
    if (rowData.yt_link === 'N/A') {
      // Use website research when yt_link is "N/A"
      logger.info(`Using website research for row ${rowNumber} (yt_link is N/A)`);
      if (!rowData.website || typeof rowData.website !== 'string' || rowData.website.trim() === '') {
        throw new Error(`yt_link is N/A but website is missing for row ${rowNumber}`);
      }
      research = await getWebsiteResearch(rowData.website, rowData.niche);
    } else {
      // Use YouTube research for normal yt_link values
      research = await getResearch(rowData.yt_link, rowData.niche);
    }

    // Personalize email
    await job.updateProgress(50);
    const personalizedEmail = await personalize(templateName, rowData, research);

    // Send email
    await job.updateProgress(75);
    const sendResult = await sendEmail(
      rowData.email_address,
      personalizedEmail.subject,
      personalizedEmail.html
    );

    // Format log entry
    const logEntry = formatEmailLogEntry(
      sendResult.timestamp,
      sendResult.messageId,
      templateName,
      sendResult.status,
      personalizedEmail.subject,
      personalizedEmail.html,
    );

    // Update row in spreadsheet
    await dataProvider.updateRow(rowNumber, {
      [nextColumn]: logEntry,
      is_sent: true,
      sent_by: config.bot.name,
    });

    await job.updateProgress(100);

    logger.info(`Successfully processed row ${rowNumber} - ${sendResult.status}`);
  } catch (error: any) {
    logger.error(`Error processing row ${rowNumber}:`, error);
    throw error;
  }
}

/**
 * Processes a SEND_EMAIL job: just sends email (for pre-personalized content)
 */
async function sendEmailJob(job: Job<SendEmailJobData>): Promise<void> {
  const { rowNumber, to, subject, html, templateName, columnName } = job.data;

  logger.info(`Sending email for row ${rowNumber} to ${to}`);

  const dataProvider = getDataProvider();

  try {
    // Validate email
    if (!validateEmail(to)) {
      throw new Error(`Invalid email address: ${to}`);
    }

    // Send email
    const sendResult = await sendEmail(to, subject, html);

    // Format log entry
    const logEntry = formatEmailLogEntry(
      sendResult.timestamp,
      sendResult.messageId,
      templateName,
      sendResult.status,
      subject
    );

    // Update row
    await dataProvider.updateRow(rowNumber, {
      [columnName]: logEntry,
      is_sent: true,
      sent_by: config.bot.name,
    });

    logger.info(`Successfully sent email for row ${rowNumber} - ${sendResult.status}`);
  } catch (error: any) {
    logger.error(`Error sending email for row ${rowNumber}:`, error);
    throw error;
  }
}

/**
 * Main job processor
 */
async function processJob(job: Job<JobData>): Promise<void> {
  logger.info(`Processing job ${job.id} of type ${job.data.type}`);

  try {
    switch (job.data.type) {
      case JobType.PROCESS_ROW:
        await processRowJob(job as Job<ProcessRowJobData>);
        break;

      case JobType.SEND_EMAIL:
        await sendEmailJob(job as Job<SendEmailJobData>);
        break;

      default:
        logger.warn(`Unknown job type: ${(job.data as any).type}`);
    }
  } catch (error) {
    logger.error(`Job ${job.id} failed:`, error);
    throw error;
  }
}

/**
 * Creates and starts the BullMQ worker
 */
export function createWorker(): Worker {
  const worker = new Worker('email-campaign', processJob, {
    connection: redisConnection,
    concurrency: config.bot.campaignConcurrency,
    lockDuration: 300000, // 5 minutes (300,000 ms)
    maxStalledCount: 3, // Allow job to stall up to 3 times before failing
    limiter: {
      max: 10, // Max 10 jobs
      duration: 60000, // Per 60 seconds
    },
  });

  // Event listeners
  worker.on('completed', (job) => {
    logger.info(`Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed:`, err);
  });

  worker.on('error', (err) => {
    logger.error('Worker error:', err);
  });

  worker.on('stalled', (jobId) => {
    logger.warn(`Job ${jobId} stalled`);
  });

  logger.info(`Worker started with concurrency ${config.bot.campaignConcurrency}`);

  return worker;
}

/**
 * Gracefully closes the worker
 */
export async function closeWorker(worker: Worker): Promise<void> {
  logger.info('Closing worker...');
  await worker.close();
  await redisConnection.quit();
  logger.info('Worker closed');
}

