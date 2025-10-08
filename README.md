# E-Services API

A comprehensive NestJS backend service for airtime top-up, data bundles, TV bill payments, and utility services integration with Hubtel API.

# Hubtel Commission
https://explore.hubtel.com/legal/service-fees/

## 🚀 Features

- **Airtime Services**: Top-up airtime for MTN, Vodafone, and AirtelTigo
- **Data Bundles**: Purchase data bundles for all networks
- **TV Bill Payments**: Pay DSTV, GoTV, and StarTimes bills
- **Utility Services**: ECG and Ghana Water top-ups
- **USSD Integration**: Complete USSD flow for mobile services
- **Payment-First Architecture**: Secure payment processing before service delivery
- **Comprehensive Logging**: Transaction tracking and monitoring
- **Environment-Based Configuration**: Flexible deployment configuration

## 📋 Prerequisites

- Node.js (v16 or higher)
- MongoDB
- Hubtel API credentials
- Environment variables configured

## 🛠️ Installation

```bash
# Clone the repository
git clone <repository-url>
cd e-services

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Start the application
npm run start:dev
```

## 🔧 Environment Variables

Create a `.env` file with the following variables:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/e-services

# Hubtel API Configuration
HUBTEL_AUTH_TOKEN=your_hubtel_auth_token
HUBTEL_PREPAID_DEPOSIT_ID=your_prepaid_deposit_id
HUBTEL_POS_SALES_ID=your_pos_sales_id
HB_CALLBACK_URL=https://e-services-0qrv.onrender.com/api/v1/flow/ussd/callback

# Application Configuration
BASE_URL=https://e-services-0qrv.onrender.com
JWT_SECRET=your_jwt_secret
PORT=3000
```

## 📡 API Endpoints

### Airtime Services

- `POST /airtime/payment-request` - Create payment request for airtime top-up
- `POST /airtime/topup` - Legacy endpoint (redirects to payment flow)
- `POST /airtime/payment-callback` - Handle payment callbacks

### Bundle Services

- `POST /bundle/payment-request` - Create payment request for data bundle
- `POST /bundle/purchase` - Legacy endpoint (redirects to payment flow)
- `GET /bundle/query` - Query available bundles
- `POST /bundle/payment-callback` - Handle payment callbacks
- `POST /bundle/callback` - Handle service delivery callbacks

### TV Bill Services

- `POST /tv-bills/payment-request` - Create payment request for TV bill payment
- `POST /tv-bills/pay` - Legacy endpoint (redirects to payment flow)
- `GET /tv-bills/query` - Query TV account information
- `POST /tv-bills/payment-callback` - Handle payment callbacks
- `POST /tv-bills/callback` - Handle service delivery callbacks

### Utility Services

- `POST /utility/ecg/payment-request` - Create payment request for ECG top-up
- `POST /utility/ghana-water/payment-request` - Create payment request for Ghana Water top-up
- `POST /utility/ecg/topup` - Legacy endpoint (redirects to payment flow)
- `POST /utility/ghana-water/topup` - Legacy endpoint (redirects to payment flow)
- `GET /utility/ecg/query` - Query ECG meters
- `GET /utility/ghana-water/query` - Query Ghana Water account
- `POST /utility/payment-callback` - Handle payment callbacks
- `POST /utility/ecg/callback` - Handle ECG service delivery callbacks
- `POST /utility/ghana-water/callback` - Handle Ghana Water service delivery callbacks

### Payment Services

- `GET /payment/return` - Handle successful payment returns
- `GET /payment/cancel` - Handle payment cancellations

### USSD Services

- `POST /ussd` - Main USSD endpoint
- `POST /ussd/callback` - USSD callback endpoint

### User Management

- `POST /auth/login` - User login
- `POST /auth/register` - User registration
- `GET /users` - Get all users
- `GET /users/:id` - Get user by ID
- `PUT /users/:id` - Update user
- `DELETE /users/:id` - Delete user

## 🔄 Payment Flow Architecture

### Payment-First Approach (Recommended)

All services now follow a **payment-first** approach for individual users:

1. **Create Payment Request**: User initiates service request
2. **Payment Processing**: Hubtel handles payment collection
3. **Service Delivery**: Service delivered only after successful payment
4. **Callback Handling**: System processes payment and service callbacks

### Flow Diagram

```
User Request → Payment Request → Hubtel Payment → Service Delivery → Success
     ↓              ↓              ↓              ↓              ↓
   API Call    Payment URL    User Pays    Commission    Confirmation
```

## 🧪 API Testing

### Airtime Payment Request

```bash
POST /airtime/payment-request
Content-Type: application/json

{
  "destination": "233550982043",
  "amount": 10.50,
  "network": "MTN",
  "callbackUrl": "https://e-services-0qrv.onrender.com/api/v1/flow/ussd/callback",
  "clientReference": "airtime_123456789"
}
```

### Bundle Payment Request

```bash
POST /bundle/payment-request
Content-Type: application/json

{
  "bundleType": "data",
  "network": "MTN",
  "destination": "233246912184",
  "bundleValue": "data_bundle_1",
  "amount": 5.00,
  "callbackUrl": "https://e-services-0qrv.onrender.com/api/v1/flow/ussd/callback",
  "clientReference": "bundle_123456789"
}
```

### TV Bill Payment Request

```bash
POST /tv-bills/payment-request
Content-Type: application/json

{
  "provider": "DSTV",
  "accountNumber": "1234567890",
  "amount": 50.00,
  "callbackUrl": "https://e-services-0qrv.onrender.com/api/v1/flow/ussd/callback",
  "clientReference": "tvbill_123456789"
}
```

## 🔐 Security Features

- **JWT Authentication**: Secure user authentication
- **Input Validation**: Comprehensive request validation
- **Error Handling**: Centralized error management
- **Transaction Logging**: Complete audit trail
- **Environment Variables**: Secure configuration management

## 📊 Monitoring & Logging

- **Transaction Tracking**: All transactions logged to MongoDB
- **Error Logging**: Comprehensive error tracking
- **Payment Status**: Real-time payment status monitoring
- **Service Delivery**: Service delivery confirmation tracking

## 🚀 Deployment

### Docker Deployment

```bash
# Build Docker image
docker build -t e-services .

# Run container
docker run -p 3000:3000 e-services
```

### Environment-Specific Configuration

- **Development**: `npm run start:dev`
- **Production**: `npm run start:prod`
- **Testing**: `npm run test`

## 📝 License

This project is licensed under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For support and questions, please contact the development team. 




Review the implementation 
Start the implementation of the commission service api based on this handleUssdCallback  async handleUssdCallback(req: HbPayments)

Why because based on the documentation the commission service is based after
payment is made into my POSSale account by the user, After the payment isSuccessful.

THe call the right service and send the amount and destination as defined in the document. 
Review the entire code for the services. Everything should be based on isSuccessful when the user is done
with the USSD interaction flow



Debit the User Account 
The purhcase on behalf of the user with 




# Commission Service Implementation Guide

## Overview

This document outlines the correct implementation of the commission service flow based on the Hubtel Commission Services API documentation. The commission service is triggered after successful payment into the POS Sale account.

## Flow Architecture

### Payment-First Approach with Commission Service

```
User Request → Payment Request → Hubtel Payment → Commission Service → Service Delivery → Success
     ↓              ↓              ↓              ↓              ↓              ↓
   USSD/API    Payment URL    User Pays    Commission    Service    Confirmation
                                    ↓              ↓              ↓
                              isSuccessful    Debit Account    Deliver Service
```

## Key Components

### 1. Commission Service (`src/services/commission.service.ts`)

The main service that handles all commission service transactions:

- **processCommissionService()**: Main method for processing commission requests
- **handleCommissionCallback()**: Processes callbacks from Hubtel
- **checkCommissionStatus()**: Checks transaction status
- **getCommissionStatistics()**: Retrieves service statistics

### 2. USSD Service Integration (`src/services/ussd.service.ts`)

Updated to use commission service after successful payment:

- **processCommissionServiceAfterPayment()**: Handles all service types through commission service
- **buildCommissionServiceRequest()**: Builds appropriate commission requests

### 3. Commission Controller (`src/controllers/commission.controller.ts`)

Provides REST API endpoints for commission services:

- `POST /commission/process` - Process commission service request
- `POST /commission/callback` - Handle commission callbacks
- `GET /commission/status/:clientReference` - Check transaction status
- `GET /commission/statistics` - Get service statistics

## Service Types Supported

### 1. Airtime Top-Up
```typescript
{
  serviceType: 'airtime',
  network: NetworkProvider.MTN, // MTN, TELECEL, AT
  destination: '233246912184',
  amount: 10.50,
  clientReference: 'airtime_123456789'
}
```

### 2. Data Bundle
```typescript
{
  serviceType: 'bundle',
  network: NetworkProvider.MTN,
  destination: '233246912184',
  amount: 5.00,
  clientReference: 'bundle_123456789',
  extraData: {
    bundleType: 'data',
    bundleValue: 'data_bundle_1'
  }
}
```

### 3. TV Bill Payment
```typescript
{
  serviceType: 'tv_bill',
  tvProvider: TVProvider.DSTV, // DSTV, GOTV, STARTIMES
  destination: '1234567890', // Account number
  amount: 50.00,
  clientReference: 'tvbill_123456789',
  extraData: {
    accountNumber: '1234567890'
  }
}
```

### 4. Utility Service
```typescript
// ECG
{
  serviceType: 'utility',
  utilityProvider: UtilityProvider.ECG,
  destination: '233246912184', // Mobile number
  amount: 25.00,
  clientReference: 'ecg_123456789',
  extraData: {
    meterNumber: '123456789'
  }
}

// Ghana Water
{
  serviceType: 'utility',
  utilityProvider: UtilityProvider.GHANA_WATER,
  destination: '123456789012', // Meter number
  amount: 30.00,
  clientReference: 'ghana_water_123456789',
  extraData: {
    meterNumber: '123456789012',
    email: 'user@example.com',
    sessionId: 'session_123'
  }
}
```

## Hubtel Commission Service Endpoints

### Base URL
```
https://cs.hubtel.com/commissionservices/{HubtelPrepaidDepositID}/{endpoint}
```

### Endpoints by Service

| Service | Network/Provider | Endpoint |
|---------|------------------|----------|
| Airtime | MTN | fdd76c884e614b1c8f669a3207b09a98 |
| Airtime | Telecel Ghana | f4be83ad74c742e185224fdae1304800 |
| Airtime | AT | dae2142eb5a14c298eace60240c09e4b |
| Bundle | MTN | fdd76c884e614b1c8f669a3207b09a98 |
| Bundle | Telecel Ghana | f4be83ad74c742e185224fdae1304800 |
| Bundle | AT | dae2142eb5a14c298eace60240c09e4b |
| TV Bill | DSTV | b230733cd56b4a0fad820e39f66bc27c |
| TV Bill | GoTV | fa27127ba039455da04a2ac8a1613e00 |
| TV Bill | StarTimes | dae2142eb5a14c298eace60240c09e4b |
| Utility | ECG | b230733cd56b4a0fad820e39f66bc27c |
| Utility | Ghana Water | fa27127ba039455da04a2ac8a1613e00 |

## Implementation Flow

### 1. USSD Flow
1. User initiates USSD session
2. User selects service and provides details
3. Payment request is created via Hubtel Payment API
4. User completes payment
5. Payment callback triggers `handleUssdCallback()`
6. If payment is successful, commission service is called
7. Commission service debits account and delivers service
8. Commission callback confirms service delivery

### 2. API Flow
1. Client makes API request to service endpoint
2. Payment request is created
3. User completes payment via payment URL
4. Payment callback triggers service delivery
5. Commission service processes the request
6. Service is delivered to user

## Environment Variables Required

```env
# Hubtel Configuration
HUBTEL_AUTH_TOKEN=your_hubtel_auth_token
HUBTEL_PREPAID_DEPOSIT_ID=your_prepaid_deposit_id
HUBTEL_POS_SALES_ID=your_pos_sales_id

# Callback URLs
HB_CALLBACK_URL=https://your-domain.com/api/v1/flow/ussd/callback

# Application Configuration
BASE_URL=https://your-domain.com
```

## Error Handling

The commission service includes comprehensive error handling:

1. **Network Errors**: Retry logic for failed requests
2. **Invalid Responses**: Validation of Hubtel responses
3. **Transaction Logging**: All transactions logged to MongoDB
4. **Status Tracking**: Real-time status monitoring

## Monitoring and Logging

### Transaction Logging
All commission service transactions are logged with:
- Service type and details
- Amount and destination
- Response codes and messages
- Commission information
- Timestamps and status

### Statistics
The service provides statistics including:
- Total transactions
- Success/failure rates
- Total amount processed
- Service type breakdown

## Testing

### Test Commission Service
```bash
curl -X POST http://localhost:3000/commission/process \
  -H "Content-Type: application/json" \
  -d '{
    "serviceType": "airtime",
    "network": "MTN",
    "destination": "233246912184",
    "amount": 10.50,
    "clientReference": "test_airtime_123"
  }'
```

### Check Status
```bash
curl http://localhost:3000/commission/status/test_airtime_123
```

### Get Statistics
```bash
curl http://localhost:3000/commission/statistics
```

## Security Considerations

1. **Authentication**: All requests require Hubtel authentication
2. **Validation**: Input validation for all parameters
3. **Logging**: Comprehensive audit trail
4. **Error Handling**: Secure error responses

## Best Practices

1. **Always check payment status** before processing commission service
2. **Use unique client references** for each transaction
3. **Handle callbacks properly** to ensure service delivery
4. **Monitor transaction status** for failed deliveries
5. **Log all transactions** for audit purposes
6. **Implement retry logic** for failed requests

## Troubleshooting

### Common Issues

1. **Invalid Endpoint**: Ensure correct endpoint for service type
2. **Authentication Errors**: Verify HUBTEL_AUTH_TOKEN
3. **Invalid Amount**: Check amount format and limits
4. **Callback Failures**: Ensure callback URL is accessible
5. **Status Check Failures**: Wait 5+ minutes before checking status

### Debug Steps

1. Check transaction logs in MongoDB
2. Verify environment variables
3. Test with Hubtel sandbox environment
4. Monitor network connectivity
5. Check callback URL accessibility



Iphones  for Grab!. Get 300MB Data @ just GHS3 + 100% Airtime Bonus!  Works on AT, MTN & Telecel top-up. Delivered instantly! Dial *714*22# now.