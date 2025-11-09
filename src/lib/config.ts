import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Config {
  nodeEnv: string;
  port: number;
  dataProvider: 'csv' | 'sheets';
  googleSheetsId: string;
  googleServiceAccountPath: string;
  resendApiKey: string;
  openaiApiKey: string;
  youtubeApiKey: string;
  apiKey: string;
  webhookSecret: string;
  allowedIps: string[];
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  bot: {
    name: string;
    campaignConcurrency: number;
    emailSendDelayMs: number;
    maxEmailsPerRun: number;
  };
  resend: {
    fromEmail: string;
    fromName: string;
  };
  paths: {
    root: string;
    templates: string;
    data: string;
    logs: string;
  };
}

const config: Config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  dataProvider: (process.env.DATA_PROVIDER as 'csv' | 'sheets') || 'csv',
  googleSheetsId: process.env.GOOGLE_SHEETS_ID || '',
  googleServiceAccountPath: process.env.GOOGLE_SERVICE_ACCOUNT_PATH || '',
  resendApiKey: process.env.RESEND_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
  apiKey: process.env.API_KEY || '',
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  allowedIps: process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',') : [],
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  bot: {
    name: process.env.BOT_NAME || 'ReplyFanBot',
    campaignConcurrency: parseInt(process.env.CAMPAIGN_CONCURRENCY || '5', 10),
    emailSendDelayMs: parseInt(process.env.EMAIL_SEND_DELAY_MS || '1000', 10),
    maxEmailsPerRun: parseInt(process.env.MAX_EMAILS_PER_RUN || '50', 10),
  },
  resend: {
    fromEmail: process.env.RESEND_FROM_EMAIL || 'noreply@replyfan.com',
    fromName: process.env.RESEND_FROM_NAME || 'ReplyFan',
  },
  paths: {
    root: join(__dirname, '../..'),
    templates: join(__dirname, '../templates'),
    data: join(__dirname, '../../data'),
    logs: join(__dirname, '../../logs'),
  },
};

export default config;

