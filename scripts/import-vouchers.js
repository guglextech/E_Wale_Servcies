const ExcelJS = require('exceljs');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const EXCEL_FILE_PATH = '../sample-vouchers.xlsx';

async function importVouchersFromExcel() {
  try {
    console.log('📊 Starting voucher import from Excel...');
    
    // Check if file exists
    const filePath = path.join(__dirname, EXCEL_FILE_PATH);
    if (!fs.existsSync(filePath)) {
      console.error('❌ Excel file not found:', filePath);
      console.log('Please ensure the sample-vouchers.xlsx file exists in the project root');
      return;
    }

    // Read Excel file
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = workbook.getWorksheet(1);
    const voucherCodes = [];
    
    // Extract voucher codes from first column (skip header)
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) { // Skip header row
        const voucherCode = row.getCell(1).value?.toString();
        if (voucherCode && voucherCode.trim()) {
          voucherCodes.push(voucherCode.trim());
        }
      }
    });

    console.log(`📋 Found ${voucherCodes.length} voucher codes in Excel file`);
    console.log('📝 Voucher codes:', voucherCodes);

    if (voucherCodes.length === 0) {
      console.log('⚠️  No voucher codes found in Excel file');
      return;
    }

    // Import vouchers via API
    console.log('\n🚀 Importing vouchers via API...');
    const response = await axios.post(`${BASE_URL}/vouchers/import/array`, {
      voucher_codes: voucherCodes
    });

    console.log('✅ Import completed successfully!');
    console.log('📊 Results:', response.data);

    // Verify import by checking available vouchers
    console.log('\n🔍 Verifying import...');
    const verifyResponse = await axios.get(`${BASE_URL}/vouchers/available`);
    console.log('📊 Available vouchers after import:', verifyResponse.data);

  } catch (error) {
    console.error('❌ Import failed:', error.response?.data || error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Make sure the server is running on port 3000');
      console.log('   Run: npm run start:dev');
    }
  }
}

// Run the import
importVouchersFromExcel();
