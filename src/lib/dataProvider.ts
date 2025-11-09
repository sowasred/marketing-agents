import { ContactRow, IDataProvider } from '../types/index.js';

/**
 * Abstract base class for data providers
 * Ensures consistent interface across CSV and Google Sheets implementations
 */
export abstract class DataProvider implements IDataProvider {
  abstract getRows(): Promise<ContactRow[]>;
  abstract getRow(rowNumber: number): Promise<ContactRow | null>;
  abstract updateRow(rowNumber: number, updates: Partial<ContactRow>): Promise<void>;
  abstract addColumn(columnName: string): Promise<void>;
  abstract close(): Promise<void>;
}

