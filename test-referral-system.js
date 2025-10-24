#!/usr/bin/env node

/**
 * Referral System Test Script
 * 
 * This script demonstrates the referral system functionality:
 * 1. Initialize default referral codes (Samuel Acquah - 01, Daniel Martey - 02)
 * 2. Test referral code processing
 * 3. Show referral information
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api/v1';

async function testReferralSystem() {
  console.log('🚀 Testing Referral System...\n');

  try {
    // 1. Initialize default referral codes
    console.log('1. Initializing default referral codes...');
    const initResponse = await axios.post(`${BASE_URL}/referral/initialize`);
    console.log('✅', initResponse.data.message);
    console.log('');

    // 2. Test referral code processing
    console.log('2. Testing referral code processing...');
    
    // Test valid referral code
    console.log('   Testing valid referral code "01"...');
    const validResponse = await axios.post(`${BASE_URL}/referral/process`, {
      referralCode: '01',
      userMobile: '233550123456'
    });
    console.log('   ✅', validResponse.data.message);
    if (validResponse.data.referrerName) {
      console.log('   📝 Referrer:', validResponse.data.referrerName);
    }
    console.log('');

    // Test invalid referral code
    console.log('   Testing invalid referral code "99"...');
    const invalidResponse = await axios.post(`${BASE_URL}/referral/process`, {
      referralCode: '99',
      userMobile: '233550123457'
    });
    console.log('   ❌', invalidResponse.data.message);
    console.log('');

    // 3. Get referral information
    console.log('3. Getting referral information...');
    
    // Get referral by code
    console.log('   Getting referral info for code "01"...');
    const referralInfo = await axios.get(`${BASE_URL}/referral/code/01`);
    if (referralInfo.data) {
      console.log('   📝 Name:', referralInfo.data.name);
      console.log('   📱 Mobile:', referralInfo.data.mobileNumber);
      console.log('   🔢 Code:', referralInfo.data.referralCode);
      console.log('   👥 Total Referrals:', referralInfo.data.totalReferrals);
    }
    console.log('');

    // Get user referral info
    console.log('   Getting user referral info for 233550123456...');
    const userInfo = await axios.get(`${BASE_URL}/referral/user/233550123456`);
    if (userInfo.data) {
      console.log('   📝 User Referral Code:', userInfo.data.userReferralCode);
      console.log('   👤 Referred By:', userInfo.data.referredBy);
      console.log('   💰 Referral Earnings:', userInfo.data.referralEarnings);
    }
    console.log('');

    console.log('🎉 Referral system test completed successfully!');

  } catch (error) {
    console.error('❌ Error testing referral system:', error.response?.data || error.message);
  }
}

// Run the test
testReferralSystem();
