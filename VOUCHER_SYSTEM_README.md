# Voucher System Implementation

This document describes the complete voucher system implementation for the e-services backend.

## Overview

The voucher system allows administrators to:
- Import vouchers from Excel files
- Import vouchers as arrays
- Assign vouchers to mobile numbers
- Purchase vouchers (self or for others)
- Track voucher usage and statistics

## Features

### 1. Voucher Import
- **Excel Import**: Upload Excel files with voucher codes
- **Array Import**: Import vouchers as JSON arrays
- Automatic date assignment
- Duplicate prevention

### 2. Voucher Management
- **Assignment**: Assign vouchers to specific mobile numbers
- **Purchase**: Buy vouchers for self or others
- **Usage Tracking**: Mark vouchers as used
- **Statistics**: View total, available, assigned, and used vouchers

### 3. SMS Notifications
- **Self Purchase**: Personalized message to buyer
- **Gift Purchase**: Notification to recipient with buyer details
- Professional and engaging message format

## API Endpoints

### Import Vouchers
```http
POST /vouchers/import/excel
Content-Type: multipart/form-data

file: [Excel file]
```

```http
POST /vouchers/import/array
Content-Type: application/json

{
  "voucher_codes": ["AIDIOEIOS-001", "AIDIOEIOS-002"]
}
```

### Assign Voucher
```http
POST /vouchers/assign
Content-Type: application/json

{
  "voucher_code": "AIDIOEIOS-001",
  "mobile_number": "233244123456"
}
```

### Purchase Vouchers
```http
POST /vouchers/purchase
Content-Type: application/json

{
  "mobile_number": "233244123456",
  "name": "John Doe",
  "quantity": 2,
  "flow": "self"
}
```

For purchasing for others:
```json
{
  "mobile_number": "233244123456",
  "name": "John Doe",
  "quantity": 2,
  "flow": "other",
  "bought_for_mobile": "233244789012",
  "bought_for_name": "Jane Smith"
}
```

### Get Available Vouchers
```http
GET /vouchers/available
```

### Get Assigned Vouchers
```http
GET /vouchers/assigned/{mobileNumber}
```

### Use Voucher
```http
POST /vouchers/use/{voucherCode}
```

### Get Statistics
```http
GET /vouchers/stats
```

### Search Vouchers
```http
GET /vouchers/search?code=AIDIOEIOS-001
GET /vouchers/search?mobile=233244123456
```

## Database Schema

### Voucher Collection
```typescript
{
  voucher_code: string,           // Unique voucher code
  date: Date,                     // Import date
  used: boolean,                  // Usage status
  mobile_number_assigned: string, // Assigned mobile number
  ticket: ObjectId,               // Reference to ticket (optional)
  assigned_date: Date,            // Assignment date
  createdAt: Date,                // Creation timestamp
  updatedAt: Date                 // Update timestamp
}
```

## SMS Message Formats

### Self Purchase
```
🎉 Thank you for your purchase, [Name]!

Your voucher code(s): [Voucher Codes]

This voucher can be used for the event. Keep it safe and present it at the venue for entry.

Good luck and enjoy the event!
```

### Gift Purchase
```
🎉 Good news! [Buyer Name] ([Buyer Mobile]) has purchased voucher(s) for you!

Voucher Code(s): [Voucher Codes]

This voucher can be used for the event. Keep it safe and present it at the venue for entry.

Thank you and enjoy the event!
```

## Usage Examples

### 1. Import Vouchers from Excel
1. Prepare Excel file with voucher codes in first column
2. Use the `/vouchers/import/excel` endpoint
3. System will automatically add dates and set used status to false

### 2. Purchase Vouchers
1. Choose quantity and flow (self/other)
2. Provide recipient details if buying for others
3. System automatically assigns available vouchers
4. SMS notifications are sent automatically

### 3. Track Vouchers
- View available vouchers
- Check assigned vouchers by mobile number
- Monitor usage statistics
- Search specific vouchers

## Error Handling

The system handles various error scenarios:
- Duplicate voucher codes
- Insufficient available vouchers
- Invalid voucher codes
- Missing required fields
- File upload errors

## Security Features

- Input validation using class-validator
- File type validation for Excel uploads
- Duplicate prevention
- Audit trail with timestamps

## Testing

### Sample Data
Use the provided `sample-vouchers.xlsx` file for testing the import functionality.

### Test Scenarios
1. Import vouchers from Excel
2. Purchase vouchers for self
3. Purchase vouchers for others
4. Assign vouchers manually
5. Use vouchers
6. View statistics

## Dependencies

- `exceljs`: Excel file processing
- `multer`: File upload handling
- `class-validator`: Input validation
- `mongoose`: Database operations

## File Structure

```
src/
├── models/
│   ├── schemas/
│   │   └── voucher.schema.ts
│   └── dto/
│       └── voucher.dto.ts
├── services/
│   └── vouchers.service.ts
├── controllers/
│   └── vouchers.controller.ts
└── utils/
    └── sendSMS.ts (updated)
```

## Environment Variables

Ensure these SMS-related environment variables are set:
- `SMS_URL`
- `SMS_CLIENT_SECRET`
- `SMS_CLIENT_ID`
- `SMS_SENDER`

## Notes

- Vouchers are automatically assigned in FIFO order
- SMS notifications are sent asynchronously
- The system prevents double-booking of vouchers
- All operations are logged for audit purposes
