const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';

async function testEarningsFlow() {
  try {
    console.log('🧪 Testing earnings flow for mobile: 233550982043');
    
    // Step 1: Test earnings retrieval
    console.log('\n💰 Step 1: Testing earnings retrieval...');
    
    const earningsResponse = await axios.get(`${BASE_URL}/commission/earnings/233550982043`, {
      timeout: 10000
    });
    
    console.log('✅ Earnings retrieved successfully');
    console.log('Earnings data:', JSON.stringify(earningsResponse.data, null, 2));
    
    // Step 2: Test USSD earnings flow (simulate USSD request)
    console.log('\n📱 Step 2: Testing USSD earnings flow...');
    
    const ussdRequest = {
      Mobile: '233550982043',
      SessionId: 'test_session_earnings_001',
      Message: '1', // Select "My Earnings" option
      Type: 'initiation'
    };
    
    const ussdResponse = await axios.post(`${BASE_URL}/flow/ussd`, ussdRequest, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ USSD earnings flow processed');
    console.log('USSD response:', JSON.stringify(ussdResponse.data, null, 2));
    
  } catch (error) {
    console.log('❌ Test failed');
    if (error.response) {
      console.log('Response status:', error.response.status);
      console.log('Response data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('Error:', error.message);
    }
  }
}

testEarningsFlow();
