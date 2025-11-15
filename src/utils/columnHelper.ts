import { ContactRow } from '../types/index.js';

/**
 * Parses the numeric index from an $email_n column name
 * @param columnName - Column name like "$email_5"
 * @returns The numeric index (e.g., 5) or null if invalid
 */
export function parseColumnIndex(columnName: string): number | null {
  const match = columnName.match(/^\$email_(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Gets all $email_n column names from a row, sorted by index
 * @param row - Contact row
 * @returns Array of column names sorted numerically
 */
export function getEmailColumns(row: ContactRow): string[] {
  return Object.keys(row)
    .filter((key) => /^\$email_\d+$/i.test(key))
    .sort((a, b) => {
      const indexA = parseColumnIndex(a) || 0;
      const indexB = parseColumnIndex(b) || 0;
      return indexA - indexB;
    });
}

/**
 * Finds the next empty $email_n column in a row
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
 * @param columnName - Column name like "$email_3"
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
  subject?: string,
  html?: string,
): string {
  let entry = `${timestamp} | ${messageId} | ${templateName} | ${status}`;
  if (subject) {
    entry += ` | Subject: ${subject}`;
  }
  if (html) {
    entry += ` | HTML: ${html}`;
  }
  return entry;
}

/**
 * Checks if a row has valid required fields
 * @param row - Contact row
 * @returns true if the row has all required fields
 */
export function isValidRow(row: ContactRow): boolean {
  // Check for required fields
  if (!row.name || typeof row.name !== 'string' || row.name.trim() === '') {
    return false;
  }
  if (!row.email_address || typeof row.email_address !== 'string' || row.email_address.trim() === '') {
    return false;
  }
  return true;
}

/**
 * Checks if a row should be skipped based on flags
 * @param row - Contact row
 * @returns true if the row should be skipped
 */
export function shouldSkipRow(row: ContactRow): boolean {
  const isPaused = row.pause === true || row.pause === 'TRUE' || row.pause === 'true';
  const isInTalks = row.$in_talks === true || row.$in_talks === 'TRUE' || row.$in_talks === 'true';

  return isPaused || isInTalks;
}

