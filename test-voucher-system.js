const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testVoucherSystem() {
  console.log('🧪 Testing Voucher System...\n');

  try {
    // Test 1: Import vouchers from array
    console.log('1. Testing voucher import from array...');
    const importResponse = await axios.post(`${BASE_URL}/vouchers/import/array`, {
      voucher_codes: [
        'AIDIOEIOS-001',
        'AIDIOEIOS-002',
        'AIDIOEIOS-003',
        'AIDIOEIOS-004',
        'AIDIOEIOS-005'
      ]
    });
    console.log('✅ Import successful:', importResponse.data);

    // Test 2: Get available vouchers
    console.log('\n2. Testing get available vouchers...');
    const availableResponse = await axios.get(`${BASE_URL}/vouchers/available`);
    console.log('✅ Available vouchers:', availableResponse.data);

    // Test 3: Purchase vouchers for self
    console.log('\n3. Testing purchase for self...');
    const selfPurchaseResponse = await axios.post(`${BASE_URL}/vouchers/purchase`, {
      mobile_number: '233244123456',
      name: 'John Doe',
      quantity: 2,
      flow: 'self'
    });
    console.log('✅ Self purchase successful:', selfPurchaseResponse.data);

    // Test 4: Purchase vouchers for others
    console.log('\n4. Testing purchase for others...');
    const otherPurchaseResponse = await axios.post(`${BASE_URL}/vouchers/purchase`, {
      mobile_number: '233244789012',
      name: 'Jane Smith',
      quantity: 1,
      flow: 'other',
      bought_for_mobile: '233244999999',
      bought_for_name: 'Bob Wilson'
    });
    console.log('✅ Other purchase successful:', otherPurchaseResponse.data);

    // Test 5: Get statistics
    console.log('\n5. Testing get statistics...');
    const statsResponse = await axios.get(`${BASE_URL}/vouchers/stats`);
    console.log('✅ Statistics:', statsResponse.data);

    // Test 6: Search vouchers
    console.log('\n6. Testing search vouchers...');
    const searchResponse = await axios.get(`${BASE_URL}/vouchers/search?mobile=233244123456`);
    console.log('✅ Search results:', searchResponse.data);

    console.log('\n🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testVoucherSystem();
