import { Queue } from 'bullmq';
import { ContactRow, CampaignStats, JobType, JobData } from '../types/index.js';
import { IDataProvider } from '../types/index.js';
import { CsvDataProvider } from './csvDataProvider.js';
import { GoogleSheetsProvider } from './googleSheetsProvider.js';
import { shouldSkipRow } from '../utils/columnHelper.js';
import config from './config.js';
import logger from './logger.js';
import Redis from 'ioredis';

// Initialize Redis connection
const redisConnection = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null,
  tls: process.env.REDIS_TLS === 'false' ? undefined : {}, // Enable TLS by default for Upstash/cloud Redis
});

// Initialize BullMQ queue
export const emailQueue = new Queue('email-campaign', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 500, // Keep last 500 failed jobs
  },
});

/**
 * Gets the appropriate data provider based on configuration
 */
export function getDataProvider(): IDataProvider {
  if (config.dataProvider === 'sheets') {
    return new GoogleSheetsProvider(
      config.googleSheetsId,
      config.googleServiceAccountPath
    );
  }
  return new CsvDataProvider();
}

/**
 * Processes a single row: finds next column, adds job to queue
 */
export async function processRow(
  row: ContactRow
): Promise<boolean> {
  try {
    // Check if row should be skipped
    if (shouldSkipRow(row)) {
      logger.info(`Skipping row ${row._rowNumber} (${row.Name}) - PAUSED or IN_TALKS`);
      return false;
    }

    // Add job to queue
    const jobData: JobData = {
      type: JobType.PROCESS_ROW,
      rowNumber: row._rowNumber,
      rowData: row,
    };

    await emailQueue.add(
      `process-row-${row._rowNumber}`,
      jobData,
      {
        jobId: `row-${row._rowNumber}-${Date.now()}`,
      }
    );

    logger.info(`Added row ${row._rowNumber} (${row.Name}) to queue`);
    return true;
  } catch (error) {
    logger.error(`Error processing row ${row._rowNumber}:`, error);
    return false;
  }
}

/**
 * Runs a full campaign: loads all rows and adds eligible ones to queue
 */
export async function runCampaign(maxRows?: number): Promise<CampaignStats> {
  logger.info('Starting campaign run...');

  const stats: CampaignStats = {
    totalRows: 0,
    processedRows: 0,
    skippedRows: 0,
    sentEmails: 0,
    failedEmails: 0,
    errors: [],
  };

  const dataProvider = getDataProvider();

  try {
    // Load all rows
    const rows = await dataProvider.getRows();
    stats.totalRows = rows.length;

    logger.info(`Loaded ${rows.length} rows from data provider`);

    // Limit rows if specified
    const rowsToProcess = maxRows ? rows.slice(0, maxRows) : rows;

    // Process each row
    for (const row of rowsToProcess) {
      try {
        const processed = await processRow(row);
        
        if (processed) {
          stats.processedRows++;
        } else {
          stats.skippedRows++;
        }

        // Small delay to avoid overwhelming the queue
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error: any) {
        stats.errors.push(`Row ${row._rowNumber}: ${error.message}`);
        logger.error(`Error in campaign for row ${row._rowNumber}:`, error);
      }

      // Check if we've hit the max emails per run
      if (stats.processedRows >= config.bot.maxEmailsPerRun) {
        logger.warn(`Hit max emails per run limit (${config.bot.maxEmailsPerRun})`);
        break;
      }
    }

    logger.info('Campaign run completed', stats);
    return stats;
  } catch (error: any) {
    logger.error('Error running campaign:', error);
    stats.errors.push(`Campaign error: ${error.message}`);
    return stats;
  } finally {
    await dataProvider.close();
  }
}

/**
 * Processes a specific row by row number
 */
export async function processSingleRow(rowNumber: number): Promise<CampaignStats> {
  const stats: CampaignStats = {
    totalRows: 1,
    processedRows: 0,
    skippedRows: 0,
    sentEmails: 0,
    failedEmails: 0,
    errors: [],
  };

  const dataProvider = getDataProvider();

  try {
    const row = await dataProvider.getRow(rowNumber);

    if (!row) {
      stats.errors.push(`Row ${rowNumber} not found`);
      return stats;
    }

    const processed = await processRow(row);
    
    if (processed) {
      stats.processedRows++;
    } else {
      stats.skippedRows++;
    }

    return stats;
  } catch (error: any) {
    stats.errors.push(`Error: ${error.message}`);
    logger.error(`Error processing single row ${rowNumber}:`, error);
    return stats;
  } finally {
    await dataProvider.close();
  }
}

/**
 * Gets queue statistics
 */
export async function getQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    emailQueue.getWaitingCount(),
    emailQueue.getActiveCount(),
    emailQueue.getCompletedCount(),
    emailQueue.getFailedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    total: waiting + active + completed + failed,
  };
}

/**
 * Clears all jobs from the queue
 */
export async function clearQueue() {
  await emailQueue.drain();
  await emailQueue.clean(0, 1000, 'completed');
  await emailQueue.clean(0, 1000, 'failed');
  logger.info('Queue cleared');
}

/**
 * Closes the queue connection
 */
export async function closeQueue() {
  await emailQueue.close();
  await redisConnection.quit();
  logger.info('Queue connection closed');
}

