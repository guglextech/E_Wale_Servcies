const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testSimpleVoucherSystem() {
  console.log('🧪 Testing Simplified Voucher System...\n');

  try {
    // Test 1: Create a voucher
    console.log('1. Testing voucher creation...');
    const createResponse = await axios.post(`${BASE_URL}/vouchers/create`, {
      voucher_code: 'TEST-001'
    });
    console.log('✅ Voucher created:', createResponse.data);

    // Test 2: Get available vouchers
    console.log('\n2. Testing get available vouchers...');
    const availableResponse = await axios.get(`${BASE_URL}/vouchers/available`);
    console.log('✅ Available vouchers:', availableResponse.data);

    // Test 3: Purchase vouchers for self (without SMS)
    console.log('\n3. Testing purchase for self (without SMS)...');
    const selfPurchaseResponse = await axios.post(`${BASE_URL}/vouchers/purchase`, {
      mobile_number: '233244123456',
      name: 'John Doe',
      quantity: 1,
      flow: 'self'
    });
    console.log('✅ Self purchase successful:', selfPurchaseResponse.data);

    // Test 4: Purchase vouchers for others (without SMS)
    console.log('\n4. Testing purchase for others (without SMS)...');
    const otherPurchaseResponse = await axios.post(`${BASE_URL}/vouchers/purchase`, {
      mobile_number: '233244789012',
      name: 'Jane Smith',
      quantity: 1,
      flow: 'other',
      bought_for_mobile: '233244999999',
      bought_for_name: 'Bob Wilson'
    });
    console.log('✅ Other purchase successful:', otherPurchaseResponse.data);

    // Test 5: Send SMS after payment confirmation (self)
    console.log('\n5. Testing SMS after payment (self)...');
    const smsSelfResponse = await axios.post(`${BASE_URL}/vouchers/send-sms-after-payment`, {
      mobile_number: '233244123456',
      name: 'John Doe',
      flow: 'self'
    });
    console.log('✅ SMS sent for self:', smsSelfResponse.data);

    // Test 6: Send SMS after payment confirmation (other)
    console.log('\n6. Testing SMS after payment (other)...');
    const smsOtherResponse = await axios.post(`${BASE_URL}/vouchers/send-sms-after-payment`, {
      mobile_number: '233244789012',
      name: 'Jane Smith',
      flow: 'other',
      bought_for_name: 'Bob Wilson',
      bought_for_mobile: '233244999999'
    });
    console.log('✅ SMS sent for other:', smsOtherResponse.data);

    // Test 7: Get statistics
    console.log('\n7. Testing get statistics...');
    const statsResponse = await axios.get(`${BASE_URL}/vouchers/stats`);
    console.log('✅ Statistics:', statsResponse.data);

    console.log('\n🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testSimpleVoucherSystem();
