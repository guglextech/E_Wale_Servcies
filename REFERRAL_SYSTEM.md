# Referral System Implementation

## Overview

A simple and clean referral code system for the E-Wale Services USSD application. Users can enter referral codes after successful payments to earn bonus rewards.

## Features

- **Simple 2-digit referral codes** (01, 02, etc.)
- **Post-payment referral prompt** - Users are prompted to enter referral codes after successful payments
- **Referral validation** - Prevents self-referral and duplicate referrals
- **Bonus system** - 5% referral bonus on future transactions
- **Clean USSD flow** - Simple input with submit/cancel options

## Default Referral Codes

| Name | Referral Code | Mobile Number |
|------|---------------|---------------|
| Samuel Acquah | 01 | 233550982043 |
| Daniel Martey | 02 | 233246912184 |

## System Architecture

### Database Schema

#### Referral Collection
```typescript
{
  referralCode: string,      // Unique 2-digit code (01, 02, etc.)
  name: string,             // Referrer's name
  mobileNumber: string,     // Referrer's mobile number
  userId: ObjectId,         // Reference to User document
  totalReferrals: number,   // Total number of referrals
  totalEarnings: number,    // Total earnings from referrals
  referredUsers: string[],  // Array of referred user mobile numbers
  isActive: boolean,        // Whether referral code is active
  createdAt: Date,
  updatedAt: Date
}
```

#### User Collection (Updated)
```typescript
{
  // ... existing fields
  referralCode: string,     // User's own referral code
  referredBy: string,      // Mobile number of referrer
  referralEarnings: number, // Earnings from being referred
  totalReferrals: number   // Number of people user has referred
}
```

### Services

#### ReferralService
- `generateReferralCode(name, mobileNumber)` - Generate new referral code
- `processReferralCode(referralCode, userMobile)` - Process referral code entry
- `getReferralByCode(referralCode)` - Get referral information by code
- `getUserReferralInfo(mobileNumber)` - Get user's referral information
- `awardReferralBonus(userMobile, amount)` - Award referral bonus after payment

#### ReferralHandler
- `showReferralPrompt()` - Display referral prompt after payment
- `handleReferralPrompt()` - Handle user's choice to enter or skip
- `handleReferralCodeInput()` - Process referral code input
- `handleReferralRetry()` - Handle retry after invalid code
- `handleReferralSkip()` - Handle skip option

## USSD Flow Integration

### Payment Success Flow
1. User completes payment successfully
2. Payment callback triggers referral prompt
3. User sees: "Payment Successful! 🎉 Would you like to enter a referral code? 1. Enter referral code 2. Skip"
4. If user selects 1: Prompt for 2-digit referral code
5. If user selects 2: Show thank you message and end session

### Referral Code Input Flow
1. User enters 2-digit code (e.g., "01")
2. System validates code format and existence
3. If valid: Show success message with referrer name
4. If invalid: Show error and offer retry/skip options
5. User can retry or skip

## API Endpoints

### Referral Management
- `POST /referral/initialize` - Initialize default referral codes
- `POST /referral/generate` - Generate new referral code
- `POST /referral/process` - Process referral code entry
- `GET /referral/code/:referralCode` - Get referral by code
- `GET /referral/user/:mobileNumber` - Get user referral info

### Example API Usage

#### Initialize Default Codes
```bash
POST /referral/initialize
```

#### Process Referral Code
```bash
POST /referral/process
Content-Type: application/json

{
  "referralCode": "01",
  "userMobile": "233550123456"
}
```

#### Get Referral Information
```bash
GET /referral/code/01
```

## Testing

Run the test script to verify the referral system:

```bash
node test-referral-system.js
```

The test script will:
1. Initialize default referral codes
2. Test valid and invalid referral code processing
3. Display referral information
4. Show user referral details

## Implementation Details

### Referral Code Generation
- Codes are generated sequentially starting from "01"
- Each code is unique and 2 digits long
- Codes are padded with leading zeros (01, 02, 03, etc.)

### Validation Rules
- Referral code must be exactly 2 digits
- Code must exist and be active
- User cannot refer themselves
- User can only use one referral code (no duplicates)

### Bonus System
- 5% referral bonus on future transactions
- Bonus is awarded to the referrer when referred user makes payments
- Bonus is tracked in both user and referral records

### Error Handling
- Invalid format: "Invalid Format - Please enter a valid 2-digit referral code"
- Invalid code: "Invalid referral code"
- Self-referral: "Cannot use your own referral code"
- Already referred: "You have already used a referral code"

## Security Considerations

- Referral codes are validated server-side
- User mobile numbers are used for tracking (no sensitive data)
- Referral relationships are immutable once established
- All referral activities are logged for audit purposes

## Future Enhancements

- Referral code expiration dates
- Tiered referral bonuses
- Referral analytics dashboard
- Bulk referral code generation
- Referral code sharing via SMS/WhatsApp
