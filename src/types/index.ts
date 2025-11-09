// Core data types
export interface ContactRow {
  _rowNumber: number;
  Name: string;
  Niche: string;
  'YT Link': string;
  'YT Followers': number | string;
  Website: string;
  'Email Address': string;
  IS_Sent: boolean | string;
  Sent_by: string;
  'EMAIL_TEMPLATE-1': string;
  PAUSE: boolean | string;
  $IN_TALKS: boolean | string;
  NOTES?: string;
  [key: string]: any; // For dynamic $EMAIL_n columns
}

export interface ResearchData {
  summary: string;
  recentVideos: string[];
  channelName: string;
  channelId?: string;
}

export interface PersonalizedEmail {
  subject: string;
  html: string;
  templateName: string;
}

export interface EmailSendResult {
  messageId: string;
  timestamp: string;
  status: 'SENT' | 'FAILED';
  error?: string;
}

export interface EmailLogEntry {
  timestamp: string;
  messageId: string;
  templateName: string;
  status: string;
  subject?: string;
}

// BullMQ Job types
export enum JobType {
  PROCESS_ROW = 'PROCESS_ROW',
  SEND_EMAIL = 'SEND_EMAIL',
  FULL_CAMPAIGN = 'FULL_CAMPAIGN',
}

export interface ProcessRowJobData {
  type: JobType.PROCESS_ROW;
  rowNumber: number;
  rowData: ContactRow;
}

export interface SendEmailJobData {
  type: JobType.SEND_EMAIL;
  rowNumber: number;
  to: string;
  subject: string;
  html: string;
  templateName: string;
  columnName: string;
}

export interface FullCampaignJobData {
  type: JobType.FULL_CAMPAIGN;
  maxRows?: number;
}

export type JobData = ProcessRowJobData | SendEmailJobData | FullCampaignJobData;

// Template types
export interface TemplateContext {
  name: string;
  niche: string;
  website: string;
  ytFollowers: number | string;
  research: ResearchData;
  [key: string]: any;
}

export interface GptInstruction {
  placeholder: string;
  instruction: string;
  startIndex: number;
  endIndex: number;
}

// Data provider interface
export interface IDataProvider {
  getRows(): Promise<ContactRow[]>;
  getRow(rowNumber: number): Promise<ContactRow | null>;
  updateRow(rowNumber: number, updates: Partial<ContactRow>): Promise<void>;
  addColumn(columnName: string): Promise<void>;
  close(): Promise<void>;
}

// Campaign statistics
export interface CampaignStats {
  totalRows: number;
  processedRows: number;
  skippedRows: number;
  sentEmails: number;
  failedEmails: number;
  errors: string[];
}

// Configuration for templates
export interface TemplateConfig {
  name: string;
  filePath: string;
  description?: string;
}

// YouTube API types
export interface YouTubeVideo {
  title: string;
  videoId: string;
  publishedAt: string;
}

export interface YouTubeChannelInfo {
  channelId: string;
  channelName: string;
  subscriberCount?: number;
}

