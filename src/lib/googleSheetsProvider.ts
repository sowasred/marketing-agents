// @ts-nocheck
import { ContactRow } from '../types/index.js';
import { DataProvider } from './dataProvider.js';
import logger from './logger.js';

/**
 * Stub implementation for Google Sheets data provider
 * To be implemented when switching to production Google Sheets
 */
export class GoogleSheetsProvider extends DataProvider {
  private sheetsId: string;
  private credentialsPath: string;

  constructor(sheetsId: string, credentialsPath: string) {
    super();
    this.sheetsId = sheetsId;
    this.credentialsPath = credentialsPath;
    logger.info('GoogleSheetsProvider initialized (stub implementation)');
  }

  async getRows(): Promise<ContactRow[]> {
    throw new Error('GoogleSheetsProvider not yet implemented. Use CsvDataProvider for now.');
  }

  async getRow(rowNumber: number): Promise<ContactRow | null> {
    throw new Error('GoogleSheetsProvider not yet implemented. Use CsvDataProvider for now.');
  }

  async updateRow(rowNumber: number, updates: Partial<ContactRow>): Promise<void> {
    throw new Error('GoogleSheetsProvider not yet implemented. Use CsvDataProvider for now.');
  }

  async addColumn(columnName: string): Promise<void> {
    throw new Error('GoogleSheetsProvider not yet implemented. Use CsvDataProvider for now.');
  }

  async close(): Promise<void> {
    logger.debug('GoogleSheetsProvider closed');
  }
}

/**
 * TODO: Full implementation with googleapis
 * 
 * import { google } from 'googleapis';
 * import { JWT } from 'google-auth-library';
 * 
 * const auth = new JWT({
 *   keyFile: this.credentialsPath,
 *   scopes: ['https://www.googleapis.com/auth/spreadsheets'],
 * });
 * 
 * const sheets = google.sheets({ version: 'v4', auth });
 * 
 * // Use sheets.spreadsheets.values.get() for reading
 * // Use sheets.spreadsheets.values.update() for writing
 * // Use sheets.spreadsheets.batchUpdate() for adding columns
 */

