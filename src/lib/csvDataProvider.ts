import { createReadStream, existsSync } from 'fs';
import csvParser from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';
import { join } from 'path';
import { ContactRow } from '../types/index.js';
import { DataProvider } from './dataProvider.js';
import logger from './logger.js';
import config from './config.js';

export class CsvDataProvider extends DataProvider {
  private filePath: string;
  private headers: string[] = [];

  constructor(fileName: string = 'contacts.csv') {
    super();
    this.filePath = join(config.paths.data, fileName);
    logger.info(`CsvDataProvider initialized with file: ${this.filePath}`);
  }

  /**
   * Reads all rows from the CSV file
   */
  async getRows(): Promise<ContactRow[]> {
    if (!existsSync(this.filePath)) {
      logger.warn(`CSV file not found: ${this.filePath}`);
      return [];
    }

    return new Promise((resolve, reject) => {
      const rows: ContactRow[] = [];
      let rowNumber = 1; // Start from 1 (row 0 is headers)

      createReadStream(this.filePath)
        .pipe(csvParser())
        .on('headers', (headers: string[]) => {
          this.headers = headers;
        })
        .on('data', (data: any) => {
          rows.push({
            ...data,
            _rowNumber: rowNumber++,
          });
        })
        .on('end', () => {
          logger.info(`Loaded ${rows.length} rows from CSV`);
          resolve(rows);
        })
        .on('error', (error) => {
          logger.error('Error reading CSV file:', error);
          reject(error);
        });
    });
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
    const rows = await this.getRows();
    const rowIndex = rows.findIndex((row) => row._rowNumber === rowNumber);

    if (rowIndex === -1) {
      throw new Error(`Row ${rowNumber} not found`);
    }

    // Update the row
    rows[rowIndex] = {
      ...rows[rowIndex],
      ...updates,
    };

    // Write back to file
    await this.writeRows(rows);
    logger.info(`Updated row ${rowNumber}`);
  }

  /**
   * Adds a new column to the CSV file
   */
  async addColumn(columnName: string): Promise<void> {
    const rows = await this.getRows();

    if (this.headers.includes(columnName)) {
      logger.warn(`Column ${columnName} already exists`);
      return;
    }

    // Add column to headers
    this.headers.push(columnName);

    // Add empty value to all rows
    rows.forEach((row) => {
      row[columnName] = '';
    });

    // Write back to file
    await this.writeRows(rows);
    logger.info(`Added column: ${columnName}`);
  }

  /**
   * Writes all rows back to the CSV file
   */
  private async writeRows(rows: ContactRow[]): Promise<void> {
    // Determine all headers (including dynamic $email_n columns)
    const allHeaders = new Set<string>(this.headers);
    rows.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (key !== '_rowNumber') {
          allHeaders.add(key);
        }
      });
    });

    const headerArray = Array.from(allHeaders);

    // Create CSV writer
    const csvWriter = createObjectCsvWriter({
      path: this.filePath,
      header: headerArray.map((h) => ({ id: h, title: h })),
    });

    // Prepare records (remove _rowNumber)
    const records = rows.map((row) => {
      const record: any = {};
      headerArray.forEach((header) => {
        record[header] = row[header] !== undefined ? row[header] : '';
      });
      return record;
    });

    await csvWriter.writeRecords(records);
    logger.debug(`Wrote ${records.length} rows to CSV`);
  }
}

