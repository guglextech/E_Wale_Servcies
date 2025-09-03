# E-Services API

A comprehensive NestJS backend service for airtime top-up, data bundles, TV bill payments, and utility services integration with Hubtel API.

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