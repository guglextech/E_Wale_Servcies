const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';

async function testCorrectedFlow() {
  try {
    console.log('🧪 Testing corrected commission flow...');
    
    // Step 1: Create a commission log with sample data
    console.log('\n📝 Step 1: Creating commission log...');
    
    const testCallbackData = {
      ResponseCode: '0000',
      Message: 'Commission processed successfully',
      Data: {
        TransactionId: 'txn_corrected_001',
        ClientReference: 'corrected_session_001',
        Amount: 25.0,
        Charges: 0.0,
        AmountAfterCharges: 25.0,
        CurrencyCode: 'GHS',
        PaymentMethod: 'mobile_money',
        IsSuccessful: true,
        IsFulfilled: true,
        Message: 'Commission processed successfully',
        Meta: {
          Commission: '1.25' // 5% commission on 25 GHS
        }
      }
    };
    
    const callbackResponse = await axios.post(`${BASE_URL}/commission/test-callback`, testCallbackData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ Commission callback processed');
    console.log('Callback response:', JSON.stringify(callbackResponse.data, null, 2));
    
    // Step 2: Test earnings retrieval
    console.log('\n💰 Step 2: Testing earnings retrieval...');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const earningsResponse = await axios.get(`${BASE_URL}/commission/earnings/233550982043`);
    
    console.log('✅ Earnings retrieved successfully');
    console.log('Earnings:', JSON.stringify(earningsResponse.data, null, 2));
    
    // Step 3: Test withdrawal (if balance is sufficient)
    console.log('\n💸 Step 3: Testing withdrawal...');
    
    if (earningsResponse.data.data.availableBalance >= 10) {
      const withdrawalResponse = await axios.post(`${BASE_URL}/commission/withdraw`, {
        mobileNumber: '233550982043',
        amount: 10.0
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      console.log('✅ Withdrawal processed');
      console.log('Withdrawal response:', JSON.stringify(withdrawalResponse.data, null, 2));
    } else {
      console.log('⚠️ Insufficient balance for withdrawal test');
    }
    
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

testCorrectedFlow();
