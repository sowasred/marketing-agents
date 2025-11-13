import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { ContactRow } from '../types/index.js';
import { DataProvider } from './dataProvider.js';
import logger from './logger.js';

/**
 * Google Sheets data provider implementation
 * Provides real-time read/write access to Google Sheets
 */
export class GoogleSheetsProvider extends DataProvider {
  private sheetsId: string;
  private credentialsPath: string;
  private sheetName: string = '';
  private auth: JWT | null = null;
  private sheets: ReturnType<typeof google.sheets> | null = null;
  private headers: string[] = [];
  private cache: ContactRow[] | null = null;
  private rowNumberToSheetRow: Map<number, number> = new Map(); // Maps _rowNumber to actual sheet row
  private initPromise: Promise<void> | null = null;

  constructor(sheetsId: string, credentialsPath: string) {
    super();
    this.sheetsId = sheetsId;
    this.credentialsPath = credentialsPath;

    if (!this.sheetsId) {
      throw new Error('Google Sheets ID is required');
    }
    if (!this.credentialsPath) {
      throw new Error('Google Service Account credentials path is required');
    }

    logger.info(`GoogleSheetsProvider initialized for sheet: ${this.sheetsId}`);
  }

  /**
   * Ensures auth, sheet name, and headers are initialized
   * Uses cached promise to avoid multiple simultaneous initializations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    return this.initPromise;
  }

  /**
   * Initializes Google Auth, gets sheet name, and loads headers
   */
  private async initialize(): Promise<void> {
    // Initialize auth
    if (!this.auth || !this.sheets) {
      try {
        this.auth = new JWT({
          keyFile: this.credentialsPath,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        await this.auth.authorize();
        this.sheets = google.sheets({ version: 'v4', auth: this.auth });
        logger.debug('Google Sheets API authenticated successfully');
      } catch (error: any) {
        logger.error('Error initializing Google Auth:', error);
        throw new Error(`Failed to authenticate with Google Sheets: ${error.message}`);
      }
    }

    // Get sheet name (first sheet if not already set)
    if (!this.sheetName) {
      try {
        const response = await this.sheets!.spreadsheets.get({
          spreadsheetId: this.sheetsId,
        });

        const firstSheet = response.data.sheets?.[0];
        if (!firstSheet) {
          throw new Error('No sheets found in the spreadsheet');
        }

        this.sheetName = firstSheet.properties?.title || 'Sheet1';
        logger.debug(`Using sheet: ${this.sheetName}`);
      } catch (error: any) {
        logger.error('Error getting sheet name:', error);
        throw new Error(`Failed to get sheet name: ${error.message}`);
      }
    }

    // Load headers (always refresh to match CSV behavior)
    await this.loadHeaders();
  }

  /**
   * Loads headers from the sheet (always refreshes, like CSV re-reads from disk)
   */
  private async loadHeaders(): Promise<void> {
    if (!this.sheets || !this.sheetName) {
      throw new Error('Sheets client or sheet name not initialized');
    }

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetsId,
        range: `${this.sheetName}!1:1`, // First row only
      });

      const headerRow = response.data.values?.[0];
      if (!headerRow || headerRow.length === 0) {
        throw new Error('No headers found in the sheet');
      }

      this.headers = headerRow.map((h: any) => String(h || '').trim());
      logger.debug(`Loaded ${this.headers.length} headers from sheet`);
    } catch (error: any) {
      logger.error('Error loading headers:', error);
      throw new Error(`Failed to read headers: ${error.message}`);
    }
  }

  /**
   * Parses the actual sheet row number from a range string
   * Example: "Sheet1!A5:ZZ" -> 5
   */
  private parseRowNumberFromRange(range: string): number | null {
    // Range format: "Sheet1!A5:ZZ" or "Sheet1!5:5"
    const match = range.match(/!([A-Z]+)?(\d+)/);
    if (match && match[2]) {
      return parseInt(match[2], 10);
    }
    return null;
  }

  /**
   * Converts a sheet row array to a ContactRow object
   */
  private rowToContactRow(row: any[], actualSheetRow: number): ContactRow {
    // Calculate _rowNumber (actualSheetRow - 1, since row 1 is headers)
    const rowNumber = actualSheetRow - 1;

    const contactRow: ContactRow = {
      _rowNumber: rowNumber,
    } as ContactRow;

    // Map each header to its corresponding value
    this.headers.forEach((header, index) => {
      if (header) {
        const value = row[index];
        // Handle empty cells
        contactRow[header] = value !== undefined && value !== null ? String(value) : '';
      }
    });

    // Also include any extra columns that might exist in the row
    row.forEach((value, index) => {
      if (index >= this.headers.length && value !== undefined && value !== null) {
        // Use column letter as fallback header
        const columnLetter = this.getColumnLetter(index + 1);
        contactRow[columnLetter] = String(value);
      }
    });

    return contactRow;
  }

  /**
   * Converts a ContactRow to a sheet row array
   */
  private contactRowToRow(contactRow: Partial<ContactRow>): any[] {
    const row: any[] = new Array(this.headers.length).fill('');

    this.headers.forEach((header, index) => {
      if (header && contactRow[header] !== undefined) {
        const value = contactRow[header];
        // Convert to string, handle booleans
        if (typeof value === 'boolean') {
          row[index] = value ? 'TRUE' : 'FALSE';
        } else {
          row[index] = value !== null && value !== undefined ? String(value) : '';
        }
      }
    });

    return row;
  }

  /**
   * Gets column letter from column number (1 = A, 2 = B, etc.)
   */
  private getColumnLetter(columnNumber: number): string {
    let result = '';
    while (columnNumber > 0) {
      columnNumber--;
      result = String.fromCharCode(65 + (columnNumber % 26)) + result;
      columnNumber = Math.floor(columnNumber / 26);
    }
    return result;
  }

  /**
   * Reads all rows from the Google Sheet
   */
  async getRows(): Promise<ContactRow[]> {
    if (this.cache) {
      return this.cache;
    }

    await this.ensureInitialized();
    // Refresh headers to pick up any new columns added in Sheets
    await this.loadHeaders();

    try {
      // Read all data rows (skip header row)
      const response = await this.sheets!.spreadsheets.values.get({
        spreadsheetId: this.sheetsId,
        range: `${this.sheetName}!A2:ZZ`, // Start from row 2, go to end
      });

      const rows = response.data.values || [];
      const contactRows: ContactRow[] = [];

      // Parse the actual starting row from the range
      const range = response.data.range || '';
      const startRow = this.parseRowNumberFromRange(range) || 2; // Default to 2 if parsing fails

      rows.forEach((row, index) => {
        // Skip completely empty rows
        if (row && row.some((cell: any) => cell !== null && cell !== undefined && String(cell).trim() !== '')) {
          // Calculate actual sheet row number (startRow + index)
          const actualSheetRow = startRow + index;
          const contactRow = this.rowToContactRow(row, actualSheetRow);
          contactRows.push(contactRow);
          // Store mapping of _rowNumber to actual sheet row
          this.rowNumberToSheetRow.set(contactRow._rowNumber, actualSheetRow);
        }
      });

      this.cache = contactRows;
      logger.info(`Loaded ${contactRows.length} rows from Google Sheet`);
      return contactRows;
    } catch (error: any) {
      logger.error('Error reading rows from Google Sheet:', error);
      throw new Error(`Failed to read rows: ${error.message}`);
    }
  }

  /**
   * Gets a specific row by row number
   */
  async getRow(rowNumber: number): Promise<ContactRow | null> {
    const rows = await this.getRows();
    return rows.find((row) => row._rowNumber === rowNumber) || null;
  }

  /**
   * Updates a specific row with new data
   */
  async updateRow(rowNumber: number, updates: Partial<ContactRow>): Promise<void> {
    await this.ensureInitialized();

    // Get from cache first
    const rows = await this.getRows();
    const rowIndex = rows.findIndex((row) => row._rowNumber === rowNumber);

    if (rowIndex === -1) {
      throw new Error(`Row ${rowNumber} not found`);
    }

    const currentRow = rows[rowIndex];

    // Check if any new columns need to be added
    const newColumns: string[] = [];
    Object.keys(updates).forEach((key) => {
      if (key !== '_rowNumber' && !this.headers.includes(key)) {
        newColumns.push(key);
      }
    });

    // Add any missing columns first
    for (const columnName of newColumns) {
      await this.addColumn(columnName);
    }

    // Refresh headers if new columns were added
    if (newColumns.length > 0) {
      await this.loadHeaders();
    }

    // Merge updates with current row (excluding _rowNumber)
    const updatedRow: Partial<ContactRow> = { ...currentRow, ...updates };
    delete (updatedRow as any)._rowNumber;

    // Convert to sheet row format
    const rowData = this.contactRowToRow(updatedRow);

    // Get actual sheet row from mapping (handles gaps in sheet)
    const actualSheetRow = this.rowNumberToSheetRow.get(rowNumber);
    if (!actualSheetRow) {
      throw new Error(`Could not find actual sheet row for row number ${rowNumber}`);
    }

    // Update the entire row at once
    await this.sheets!.spreadsheets.values.update({
      spreadsheetId: this.sheetsId,
      range: `${this.sheetName}!${actualSheetRow}:${actualSheetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [rowData],
      },
    });

    // Update cache
    rows[rowIndex] = {
      ...currentRow,
      ...updates,
    };
    this.cache = rows;

    logger.info(`Updated row ${rowNumber} in Google Sheet`);
  }

  /**
   * Adds a new column to the sheet
   */
  async addColumn(columnName: string): Promise<void> {
    await this.ensureInitialized();

    // Check if column already exists
    if (this.headers.includes(columnName)) {
      logger.warn(`Column ${columnName} already exists`);
      return;
    }

    try {
      // Get sheet metadata to find the sheet ID (reuse cached sheets client)
      const spreadsheet = await this.sheets!.spreadsheets.get({
        spreadsheetId: this.sheetsId,
      });

      const sheet = spreadsheet.data.sheets?.find(
        (s) => s.properties?.title === this.sheetName
      );

      if (!sheet || !sheet.properties?.sheetId) {
        throw new Error(`Sheet ${this.sheetName} not found`);
      }

      const sheetId = sheet.properties.sheetId;
      const newColumnIndex = this.headers.length;

      // Insert new column using batchUpdate
      await this.sheets!.spreadsheets.batchUpdate({
        spreadsheetId: this.sheetsId,
        requestBody: {
          requests: [
            {
              insertDimension: {
                range: {
                  sheetId: sheetId,
                  dimension: 'COLUMNS',
                  startIndex: newColumnIndex,
                  endIndex: newColumnIndex + 1,
                },
                inheritFromBefore: false,
              },
            },
          ],
        },
      });

      // Update header row with new column name
      const columnLetter = this.getColumnLetter(newColumnIndex + 1);
      await this.sheets!.spreadsheets.values.update({
        spreadsheetId: this.sheetsId,
        range: `${this.sheetName}!${columnLetter}1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[columnName]],
        },
      });

      // Update cached headers
      this.headers.push(columnName);

      // Invalidate cache (structure changed)
      this.cache = null;
      this.rowNumberToSheetRow.clear();

      logger.info(`Added column ${columnName} to Google Sheet`);
    } catch (error: any) {
      logger.error(`Error adding column ${columnName} to Google Sheet:`, error);
      throw new Error(`Failed to add column: ${error.message}`);
    }
  }

  /**
   * Clears cached data and releases resources
   */
  async close(): Promise<void> {
    this.cache = null;
    this.headers = [];
    this.rowNumberToSheetRow.clear();
    this.sheetName = '';
    this.auth = null;
    this.sheets = null;
    this.initPromise = null;
    logger.debug('GoogleSheetsProvider closed, cache and resources cleared');
  }
}
