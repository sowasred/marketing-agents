import { GoogleSheetsProvider } from '../../dist/lib/googleSheetsProvider.js';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  const provider = new GoogleSheetsProvider(
    process.env.GOOGLE_SHEETS_ID,
    process.env.GOOGLE_SERVICE_ACCOUNT_PATH
  );

  try {
    // Test 1: getRows()
    console.log('Test 1: getRows()');
    const rows = await provider.getRows();
    console.log(`✅ Loaded ${rows.length} rows`);
    console.log('First row:', rows[0]);

    // Test 2: getRow()
    console.log('\nTest 2: getRow(1)');
    const row = await provider.getRow(1);
    console.log('✅ Row 1:', row);

    // Test 3: updateRow()
    console.log('\nTest 3: updateRow()');
    await provider.updateRow(1, { notes: 'Updated via test script' });
    console.log('✅ Row updated');

    // Verify update
    const updatedRow = await provider.getRow(1);
    console.log('Updated row notes:', updatedRow?.notes);

    // Test 4: addColumn()
    console.log('\nTest 4: addColumn()');
    await provider.addColumn('test_column');
    console.log('✅ Column added');

    // Test 5: Verify new column appears
    const rowsAfter = await provider.getRows();
    console.log('Headers include test_column:', rowsAfter[0]?.test_column !== undefined);

    // Test 6: close()
    await provider.close();
    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

test();