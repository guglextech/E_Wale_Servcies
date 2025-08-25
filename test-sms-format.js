// Test the SMS format for vouchers
const testVouchers = [
  { serial_number: 'BECE-374512', pin: 'BECE-374512' },
  { serial_number: 'BE3E-374512', pin: 'BECE-474512' },
  { serial_number: 'SN001', pin: '1234' }
];

// Simulate the SMS formatting logic
function formatVoucherSMS(vouchers, name, flow, buyer_name, buyer_mobile) {
  let message = "";
  
  // Format vouchers as "Serial number - PIN"
  const voucherTexts = vouchers.map(v => `${v.serial_number} - ${v.pin}`);
  const voucherCodesText = voucherTexts.join('\n');

  if (flow === 'other') {
    message = `Good news! ${buyer_name} (${buyer_mobile}) has purchased results checker voucher(s) for you!\n\n` +
              `Your e-voucher(s):\n${voucherCodesText}\n\n` +
              `Best of luck!`;
  } else {
    message = `Thank you for your purchase, ${name}!\n\n` +
              `Your e-voucher(s):\n${voucherCodesText}\n\n` +
              `Best of luck!`;
  }

  return message;
}

// Test different scenarios
console.log('🧪 Testing SMS Format...\n');

// Test 1: Self purchase
console.log('1. Self Purchase SMS:');
console.log(formatVoucherSMS(testVouchers, 'John Doe', 'self'));
console.log('\n' + '='.repeat(50) + '\n');

// Test 2: Purchase for others
console.log('2. Purchase for Others SMS:');
console.log(formatVoucherSMS(testVouchers, 'Jane Smith', 'other', 'John Doe', '233244123456'));
console.log('\n' + '='.repeat(50) + '\n');

// Test 3: Single voucher
console.log('3. Single Voucher SMS:');
console.log(formatVoucherSMS([testVouchers[0]], 'Bob Wilson', 'self'));
console.log('\n' + '='.repeat(50) + '\n');

// Test 4: Multiple vouchers with different formats
const mixedVouchers = [
  { serial_number: 'BECE-374512', pin: 'BECE-374512' },
  { serial_number: 'BE3E-374512', pin: 'BECE-474512' },
  { serial_number: 'NOVDEC-001', pin: '5678' },
  { serial_number: 'PLACEMENT-999', pin: 'ABCD' }
];

console.log('4. Mixed Format Vouchers SMS:');
console.log(formatVoucherSMS(mixedVouchers, 'Alice Johnson', 'self'));

console.log('\n✅ SMS format test completed!');
