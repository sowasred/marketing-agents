import { ContactRow } from '../types/index.js';

/**
 * Parses the numeric index from an $EMAIL_n column name
 * @param columnName - Column name like "$EMAIL_5"
 * @returns The numeric index (e.g., 5) or null if invalid
 */
export function parseColumnIndex(columnName: string): number | null {
  const match = columnName.match(/^\$EMAIL_(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Creates an $EMAIL_n column name from an index
 * @param index - Numeric index (e.g., 5)
 * @returns Column name like "$EMAIL_5"
 */
export function createColumnName(index: number): string {
  return `$EMAIL_${index}`;
}

/**
 * Gets all $EMAIL_n column names from a row, sorted by index
 * @param row - Contact row
 * @returns Array of column names sorted numerically
 */
export function getEmailColumns(row: ContactRow): string[] {
  return Object.keys(row)
    .filter((key) => key.startsWith('$EMAIL_'))
    .sort((a, b) => {
      const indexA = parseColumnIndex(a) || 0;
      const indexB = parseColumnIndex(b) || 0;
      return indexA - indexB;
    });
}

/**
 * Finds the next empty $EMAIL_n column in a row
 * @param row - Contact row
 * @returns The next empty column name, or null if all are filled
 */
export function findNextEmptyEmailColumn(row: ContactRow): string | null {
  const emailCols = getEmailColumns(row);
  
  // Find first empty column
  for (const col of emailCols) {
    const value = row[col];
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return col;
    }
  }
  return null;
}

/**
 * Determines the template name based on column name
 * @param columnName - Column name like "$EMAIL_3"
 * @returns Template name like "email_3"
 */
export function getTemplateNameFromColumn(columnName: string): string {
  const index = parseColumnIndex(columnName);
  if (!index) {
    return 'email_1';
  }
  return `email_${index}`;
}

/**
 * Formats an email log entry for storage in a column
 * @param timestamp - ISO timestamp
 * @param messageId - Email provider message ID
 * @param templateName - Template used
 * @param status - Send status
 * @param subject - Optional email subject
 * @returns Formatted log entry string
 */
export function formatEmailLogEntry(
  timestamp: string,
  messageId: string,
  templateName: string,
  status: string,
  subject?: string
): string {
  let entry = `${timestamp} | ${messageId} | ${templateName} | ${status}`;
  if (subject) {
    entry += ` | Subject: ${subject}`;
  }
  return entry;
}

/**
 * Parses an email log entry from a column value
 * @param logEntry - Raw log entry string
 * @returns Parsed log data or null if invalid
 */
export function parseEmailLogEntry(logEntry: string): {
  timestamp: string;
  messageId: string;
  templateName: string;
  status: string;
  subject?: string;
} | null {
  if (!logEntry || typeof logEntry !== 'string') {
    return null;
  }

  const parts = logEntry.split(' | ');
  if (parts.length < 4) {
    return null;
  }

  const result: any = {
    timestamp: parts[0],
    messageId: parts[1],
    templateName: parts[2],
    status: parts[3],
  };

  if (parts[4] && parts[4].startsWith('Subject: ')) {
    result.subject = parts[4].replace('Subject: ', '');
  }

  return result;
}

/**
 * Checks if a row should be skipped based on flags
 * @param row - Contact row
 * @returns true if the row should be skipped
 */
export function shouldSkipRow(row: ContactRow): boolean {
  const isPaused = row.PAUSE === true || row.PAUSE === 'TRUE' || row.PAUSE === 'true';
  const isInTalks = row.$IN_TALKS === true || row.$IN_TALKS === 'TRUE' || row.$IN_TALKS === 'true';
  
  return isPaused || isInTalks;
}

/**
 * Converts boolean-like values to actual booleans
 * @param value - Value to convert
 * @returns boolean value
 */
export function toBoolean(value: any): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return false;
}

