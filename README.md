# E-Services USSD Application

A comprehensive USSD application for various digital services including result vouchers, data bundles, and airtime top-ups.

## Features

### 1. Result Vouchers
- BECE Checker Vouchers
- WASSCE/NovDec Checker Vouchers  
- School Placement Checker Vouchers

### 2. Data Bundle Purchase
- **MTN Data Bundles** - Complete bundle query and purchase flow
- **Telecel Data Bundles** - Complete bundle query and purchase flow
- **AT Data Bundles** - Complete bundle query and purchase flow
- **Pagination Support** - Navigate through available bundles with Next/Back options
- **Real-time Bundle Query** - Fetch available bundles from Hubtel API
- **Bundle Selection** - Choose from available bundles with pricing

### 4. Pay Bills (TV Subscriptions)
- **DSTV Bill Payments** - Complete account query and bill payment flow
- **GoTV Bill Payments** - Complete account query and bill payment flow  
- **StarTimes TV Bill Payments** - Complete account query and bill payment flow
- **Account Validation** - Real-time account verification before payment
- **Amount Validation** - Support for 2 decimal places
- **Transaction Logging** - Complete audit trail for all payments
### 3. Airtime Top-Up
- MTN Airtime Top-Up
- Telecel Ghana Airtime Top-Up
- AT Airtime Top-Up
- Maximum amount: GHS 100 per transaction
- Support for 2 decimal places

## USSD Flow

### Main Menu
```
Welcome to E-Wale
1. Results Voucher
2. Data Bundle
3. Airtime Top-Up
4. Pay Bills
5. ECG Prepaid - soon
0. Contact us
```

### Data Bundle Flow
1. **Select Network** (MTN/Telecel/AT)
2. **Browse Bundles** with pagination:
   - View 4 bundles per page
   - Navigate with "#. Next" / "0. Back"
   - Go back with "0. Back"
3. **Select Bundle** from available options
4. **Enter Mobile Number** (to purchase the selected bundle)
5. **Confirm Purchase** with bundle details
6. **Complete Payment** via Mobile Money

### Pay Bills Flow
1. **Select TV Provider** (DSTV/GoTV/StarTimes TV)
2. **Enter Account Number** (to query account details)
3. **View Account Information** (name, account, amount due, bouquet)
4. **Enter Payment Amount** (with 2 decimal place validation)
5. **Confirm Payment** with account and amount details
6. **Complete Payment** via Mobile Money

### Airtime Top-Up Flow
1. Select Network (MTN/Telecel/AT)
2. Enter airtime amount (max GHS 100)
3. Confirm order details
4. Complete payment

## API Endpoints

### Bundle Services
- `GET /bundle/query` - Query available bundles for a number
- `POST /bundle/purchase` - Purchase data bundle
- `POST /bundle/callback` - Handle Hubtel callbacks

### TV Bills Services
- `GET /tv-bills/query` - Query TV account details
- `POST /tv-bills/pay` - Pay TV bill
- `POST /tv-bills/callback` - Handle Hubtel callbacks

### Airtime Services
- `POST /airtime/payment-request` - Create payment request for airtime
- `POST /airtime/topup` - Create payment request (legacy endpoint)
- `POST /airtime/payment-callback` - Handle payment callbacks
- `POST /airtime/callback` - Handle Hubtel callbacks

### Payment Services
- `GET /payment/return` - Handle successful payment returns
- `GET /payment/cancel` - Handle cancelled payments

### USSD Services
- `POST /ussd` - Handle USSD requests
- `POST /ussd/callback` - Handle payment callbacks

## Hubtel Integration

The application integrates with Hubtel's data bundle and airtime services:

### MTN Data Bundles
- **Query Endpoint**: `b230733cd56b4a0fad820e39f66bc27c`
- **Purchase Endpoint**: `b230733cd56b4a0fad820e39f66bc27c`

### Telecel Data Bundles
- **Query Endpoint**: `fa27127ba039455da04a2ac8a1613e00`
- **Purchase Endpoint**: `fa27127ba039455da04a2ac8a1613e00`

### AT Data Bundles
- **Query Endpoint**: `06abd92da459428496967612463575ca`
- **Purchase Endpoint**: `06abd92da459428496967612463575ca`

### TV Bills Services
- **DSTV**: `297a96656b5846ad8b00d5d41b256ea7`
- **GoTV**: `e6ceac7f3880435cb30b048e9617eb41`
- **StarTimes TV**: `6598652d34ea4112949c93c079c501ce`

### Airtime Services
- **MTN Airtime**: `fdd76c884e614b1c8f669a3207b09a98`
- **Telecel Airtime**: `f4be83ad74c742e185224fdae1304800`
- **AT Airtime**: `dae2142eb5a14c298eace60240c09e4b`

## TV Bills Features

### Account Validation
- **Real-time account queries** from Hubtel
- **Account number format validation** for each provider
- **Account information display** (name, account, amount due, bouquet)
- **Error handling** for invalid or non-existent accounts

### Payment Processing
- **Amount validation** with 2 decimal place support
- **Transaction logging** for all bill payments
- **Callback processing** for payment status updates
- **Commission tracking** from Hubtel responses

### Account Display Format
```
Name: John Barnes
Account: 7029864396
Amount Due: GHS 0.00
Bouquet: DTH_Super

Enter payment amount:
```

## Data Bundle Features

### Pagination System
- **4 bundles per page** for optimal USSD display
- **Next/Back navigation** with option #/0
- **Back option** (0) to return to network selection
- **Page indicators** showing current page and total pages

### Bundle Display Format
```
Available Bundles (Page 1/3):
1. 17.79MB - GHS 0.50
2. Kokrokoo 400MB, 5am to 8am - GHS 1.24
3. 35.57MB - GHS 1.00
4. 349.24MB - GHS 3.00
5. 718.91MB - GHS 10.00

#. Next
0. Back
```

### Error Handling
- **Invalid mobile numbers** - Proper validation and error messages
- **Network errors** - Graceful handling of API failures
- **No bundles available** - Clear messaging when no bundles found
- **Invalid selections** - Validation for all user inputs

## Environment Variables

Required environment variables:

```env
# Hubtel Configuration
HUBTEL_AUTH_TOKEN=your-hubtel-auth-token
HUBTEL_PREPAID_DEPOSIT_ID=2023298
HUBTEL_POS_SALES_ID=11684
HB_CALLBACK_URL=https://your-domain.com/api/callback
HUB_ACCESS_TOKEN=your-hubtel-access-token

# Base URL for callbacks
BASE_URL=https://your-domain.com/api

# Database
MONGODB_URI=mongodb://localhost:27017/e-services

# JWT
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=24h
```

## Technical Implementation

### Session Management
- **State persistence** across USSD steps
- **Bundle data caching** to avoid repeated API calls
- **Pagination state** maintained during navigation
- **Error recovery** with session cleanup

### API Integration
- **Real-time bundle queries** from Hubtel
- **Proper error handling** for API failures
- **Transaction logging** for all operations
- **Callback processing** for transaction status

### USSD Flow Control
- **Step-by-step navigation** with proper validation
- **Back navigation** support throughout the flow
- **Error recovery** with clear user messaging
- **Session timeout** handling

## Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables
4. Start the application: `npm run start:dev`

## Testing

### USSD Flow Testing
1. Dial the USSD code
2. Select "2. Data Bundle"
3. Choose network (MTN/Telecel/AT)
4. Enter a valid mobile number
5. Browse available bundles using pagination
6. Select a bundle and confirm purchase
7. Complete payment via Mobile Money

### TV Bills Testing
1. Dial the USSD code
2. Select "4. Pay Bills"
3. Choose TV provider (DSTV/GoTV/StarTimes TV)
4. Enter a valid account number
5. Review account information
6. Enter payment amount
7. Confirm payment and complete via Mobile Money

### API Testing
- Test airtime payment request: `POST /airtime/payment-request` with airtime details
- Test bundle query: `GET /bundle/query?destination=233246912184&network=MTN`
- Test bundle purchase: `POST /bundle/purchase` with proper payload
- Test callback handling: `POST /bundle/callback` with Hubtel callback data
- Test TV account query: `GET /tv-bills/query?accountNumber=7029864396&provider=DSTV`
- Test TV bill payment: `POST /tv-bills/pay` with proper payload
- Test TV callback handling: `POST /tv-bills/callback` with Hubtel callback data

## Bundle Types Supported

### MTN Bundles
- Regular data bundles (17.79MB to 39.62GB)
- Kokrokoo bundles (time-specific)
- Video bundles
- Social media bundles
- Flexi bundles

### Telecel Bundles
- Daily bundles
- Weekly bundles
- Monthly bundles
- Dual recharge bundles

### AT Bundles
- 80MB to 11GB bundles
- Various pricing tiers

## Error Codes

- **0000**: Success
- **0001**: Transaction pending
- **2001**: Invalid destination number
- **Other codes**: Various error conditions

## Security Features

- **Input validation** for all user inputs
- **API authentication** with Hubtel tokens
- **Transaction logging** for audit trails
- **Session management** with timeout handling
- **Error handling** without exposing sensitive data

The system is now fully functional with complete data bundle purchase flow, TV bill payments, and proper Hubtel API integration! 🎉 