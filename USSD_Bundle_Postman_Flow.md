# USSD Bundle Purchase Flow - Postman Testing Guide

## 📱 Complete Flow Overview

### **Self Flow (5 Steps + Payment):**
1. **Step 1**: Initiation - User dials `*714*51#`
2. **Step 2**: Main Menu - User selects `"2"` (Data Bundle)
3. **Step 3**: Network Selection - User selects network (1=MTN, 2=Telecel, 3=AT)
4. **Step 4**: Bundle Category - User selects category
5. **Step 5**: Bundle Selection - User selects bundle
6. **Step 6**: Buy For Selection - User selects `"1"` (Self) → **Direct to Order Summary**
7. **Step 7**: Order Summary Confirmation - User selects `"1"` (Confirm)

### **Other Flow (6 Steps + Payment):**
1. **Step 1**: Initiation - User dials `*714*51#`
2. **Step 2**: Main Menu - User selects `"2"` (Data Bundle)
3. **Step 3**: Network Selection - User selects network
4. **Step 4**: Bundle Category - User selects category
5. **Step 5**: Bundle Selection - User selects bundle
6. **Step 6**: Buy For Selection - User selects `"2"` (Other)
7. **Step 7**: Mobile Input - User enters recipient mobile
8. **Step 8**: Order Summary Confirmation - User selects `"1"` (Confirm)

---

## 🔥 POSTMAN COLLECTION

### **Base URL:** `{{baseUrl}}/ussd/hubtel`

### **Headers:**
```
Content-Type: application/json
```

---

## 📋 SELF FLOW - MTN BUNDLE

### **Step 1: Initiation**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Initiation",
  "Mobile": "233262195121",
  "SessionId": "bundle_self_mtn_001",
  "ServiceCode": "*714*51",
  "Message": "*714*51#",
  "Operator": "airtel",
  "Sequence": 1,
  "ClientState": "",
  "Platform": "USSD"
}
```

**Expected Response:**
```
Welcome to E-Services

1. Airtime Top-up
2. Data Bundle
3. Pay Bills
4. Utility Service
5. Result Checker

Select an option:
```

### **Step 2: Main Menu Selection**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Response",
  "Mobile": "233262195121",
  "SessionId": "bundle_self_mtn_001",
  "ServiceCode": "*714*51",
  "Message": "2",
  "Operator": "airtel",
  "Sequence": 2,
  "ClientState": "",
  "Platform": "USSD"
}
```

**Expected Response:**
```
Select Network:
1. MTN
2. Telecel Ghana
3. AT

Select network:
```

### **Step 3: Network Selection**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Response",
  "Mobile": "233262195121",
  "SessionId": "bundle_self_mtn_001",
  "ServiceCode": "*714*51",
  "Message": "1",
  "Operator": "airtel",
  "Sequence": 3,
  "ClientState": "",
  "Platform": "USSD"
}
```

**Expected Response:**
```
Select Bundle Package:

1. Data Bundles (5 bundles)
2. Kokrokoo Bundles (2 bundles)
3. Video Bundles (3 bundles)
4. Social Media Bundles (3 bundles)

99. Back

Select category:
```

### **Step 4: Bundle Category Selection**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Response",
  "Mobile": "233262195121",
  "SessionId": "bundle_self_mtn_001",
  "ServiceCode": "*714*51",
  "Message": "1",
  "Operator": "airtel",
  "Sequence": 4,
  "ClientState": "",
  "Platform": "USSD"
}
```

**Expected Response:**
```
Data Bundles:
1. 20.46MB - GH₵0.50
2. 40.91MB - GH₵1.00
3. 401.63MB - GH₵3.00
4. 826.72MB - GH₵10.00
5. 1.37GB - GH₵20.00
6. 2.74GB - GH₵40.00

0. Next Page
99. Back to Packages

Page 1 of 1
Select bundle:
```

### **Step 5: Bundle Selection**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Response",
  "Mobile": "233262195121",
  "SessionId": "bundle_self_mtn_001",
  "ServiceCode": "*714*51",
  "Message": "4",
  "Operator": "airtel",
  "Sequence": 5,
  "ClientState": "",
  "Platform": "USSD"
}
```

**Expected Response:**
```
Who are you buying for?
1. My Number
2. Other Number

Select option:
```

### **Step 6: Buy For Selection (Self)**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Response",
  "Mobile": "233262195121",
  "SessionId": "bundle_self_mtn_001",
  "ServiceCode": "*714*51",
  "Message": "1",
  "Operator": "airtel",
  "Sequence": 6,
  "ClientState": "",
  "Platform": "USSD"
}
```

**Expected Response:**
```
Bundle Order Summary:

Network: MTN
Bundle: 826.72MB
Mobile: 233262195121 (Self)
Amount: GH₵10.00

1. Confirm
2. Cancel

Select option:
```

### **Step 7: Order Summary Confirmation**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Response",
  "Mobile": "233262195121",
  "SessionId": "bundle_self_mtn_001",
  "ServiceCode": "*714*51",
  "Message": "1",
  "Operator": "airtel",
  "Sequence": 7,
  "ClientState": "",
  "Platform": "USSD"
}
```

**Expected Response:**
```
Payment processing...
You will receive a payment prompt shortly.

Thank you for using E-Services!
```

---

## 📋 OTHER FLOW - AT BUNDLE

### **Step 1: Initiation**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Initiation",
  "Mobile": "233262195121",
  "SessionId": "bundle_other_at_001",
  "ServiceCode": "*714*51",
  "Message": "*714*51#",
  "Operator": "airtel",
  "Sequence": 1,
  "ClientState": "",
  "Platform": "USSD"
}
```

**Expected Response:**
```
Welcome to E-Services

1. Airtime Top-up
2. Data Bundle
3. Pay Bills
4. Utility Service
5. Result Checker

Select an option:
```

### **Step 2: Main Menu Selection**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Response",
  "Mobile": "233262195121",
  "SessionId": "bundle_other_at_001",
  "ServiceCode": "*714*51",
  "Message": "2",
  "Operator": "airtel",
  "Sequence": 2,
  "ClientState": "",
  "Platform": "USSD"
}
```

**Expected Response:**
```
Select Network:
1. MTN
2. Telecel Ghana
3. AT

Select network:
```

### **Step 3: Network Selection (AT)**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Response",
  "Mobile": "233262195121",
  "SessionId": "bundle_other_at_001",
  "ServiceCode": "*714*51",
  "Message": "3",
  "Operator": "airtel",
  "Sequence": 3,
  "ClientState": "",
  "Platform": "USSD"
}
```

**Expected Response:**
```
Select Bundle Package:

1. BigTime Data (11 bundles)
2. Fuse Bundles (4 bundles)
3. Kokoo Bundles (8 bundles)
4. XXL Family Bundles (3 bundles)

99. Back

Select category:
```

### **Step 4: Bundle Category Selection**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Response",
  "Mobile": "233262195121",
  "SessionId": "bundle_other_at_001",
  "ServiceCode": "*714*51",
  "Message": "1",
  "Operator": "airtel",
  "Sequence": 4,
  "ClientState": "",
  "Platform": "USSD"
}
```

**Expected Response:**
```
BigTime Data:
1. 50MB - GH₵1.00
2. 110MB - GH₵2.00
3. 385MB - GH₵3.00
4. 550MB - GH₵5.00
5. 880MB - GH₵10.00
6. 1.7GB - GH₵20.00

0. Next Page
99. Back to Packages

Page 1 of 2
Select bundle:
```

### **Step 5: Bundle Selection**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Response",
  "Mobile": "233262195121",
  "SessionId": "bundle_other_at_001",
  "ServiceCode": "*714*51",
  "Message": "5",
  "Operator": "airtel",
  "Sequence": 5,
  "ClientState": "",
  "Platform": "USSD"
}
```

**Expected Response:**
```
Who are you buying for?
1. My Number
2. Other Number

Select option:
```

### **Step 6: Buy For Selection (Other)**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Response",
  "Mobile": "233262195121",
  "SessionId": "bundle_other_at_001",
  "ServiceCode": "*714*51",
  "Message": "2",
  "Operator": "airtel",
  "Sequence": 6,
  "ClientState": "",
  "Platform": "USSD"
}
```

**Expected Response:**
```
Enter Mobile Number
Enter recipient's mobile number:
```

### **Step 7: Mobile Number Input**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Response",
  "Mobile": "233262195121",
  "SessionId": "bundle_other_at_001",
  "ServiceCode": "*714*51",
  "Message": "0550982043",
  "Operator": "airtel",
  "Sequence": 7,
  "ClientState": "",
  "Platform": "USSD"
}
```

**Expected Response:**
```
Bundle Order Summary:

Network: AT
Bundle: 880MB
Mobile: 233550982043 (Other)
Amount: GH₵10.00

1. Confirm
2. Cancel

Select option:
```

### **Step 8: Order Summary Confirmation**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Response",
  "Mobile": "233262195121",
  "SessionId": "bundle_other_at_001",
  "ServiceCode": "*714*51",
  "Message": "1",
  "Operator": "airtel",
  "Sequence": 8,
  "ClientState": "",
  "Platform": "USSD"
}
```

**Expected Response:**
```
Payment processing...
You will receive a payment prompt shortly.

Thank you for using E-Services!
```

---

## 📋 TELECEL FLOW - OTHER BUNDLE

### **Step 1: Initiation**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Initiation",
  "Mobile": "233262195121",
  "SessionId": "bundle_other_telecel_001",
  "ServiceCode": "*714*51",
  "Message": "*714*51#",
  "Operator": "airtel",
  "Sequence": 1,
  "ClientState": "",
  "Platform": "USSD"
}
```

### **Step 2: Main Menu Selection**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Response",
  "Mobile": "233262195121",
  "SessionId": "bundle_other_telecel_001",
  "ServiceCode": "*714*51",
  "Message": "2",
  "Operator": "airtel",
  "Sequence": 2,
  "ClientState": "",
  "Platform": "USSD"
}
```

### **Step 3: Network Selection (Telecel)**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Response",
  "Mobile": "233262195121",
  "SessionId": "bundle_other_telecel_001",
  "ServiceCode": "*714*51",
  "Message": "2",
  "Operator": "airtel",
  "Sequence": 3,
  "ClientState": "",
  "Platform": "USSD"
}
```

**Expected Response:**
```
Select Bundle Package:

1. No Expiry Bundles (11 bundles)
2. Night Bundles (2 bundles)
3. Hour Boost (2 bundles)
4. Time-Based Bundles (11 bundles)

99. Back

Select category:
```

### **Step 4: Bundle Category Selection**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Response",
  "Mobile": "233262195121",
  "SessionId": "bundle_other_telecel_001",
  "ServiceCode": "*714*51",
  "Message": "1",
  "Operator": "airtel",
  "Sequence": 4,
  "ClientState": "",
  "Platform": "USSD"
}
```

**Expected Response:**
```
No Expiry Bundles:
1. 22MB - GH₵0.50
2. 49.5MB - GH₵1.00
3. 110MB - GH₵2.00
4. 550MB - GH₵5.00
5. 880MB - GH₵10.00
6. 1.7GB - GH₵20.00

0. Next Page
99. Back to Packages

Page 1 of 2
Select bundle:
```

### **Step 5: Bundle Selection**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Response",
  "Mobile": "233262195121",
  "SessionId": "bundle_other_telecel_001",
  "ServiceCode": "*714*51",
  "Message": "5",
  "Operator": "airtel",
  "Sequence": 5,
  "ClientState": "",
  "Platform": "USSD"
}
```

### **Step 6: Buy For Selection (Other)**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Response",
  "Mobile": "233262195121",
  "SessionId": "bundle_other_telecel_001",
  "ServiceCode": "*714*51",
  "Message": "2",
  "Operator": "airtel",
  "Sequence": 6,
  "ClientState": "",
  "Platform": "USSD"
}
```

### **Step 7: Mobile Number Input**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Response",
  "Mobile": "233262195121",
  "SessionId": "bundle_other_telecel_001",
  "ServiceCode": "*714*51",
  "Message": "0241234567",
  "Operator": "airtel",
  "Sequence": 7,
  "ClientState": "",
  "Platform": "USSD"
}
```

### **Step 8: Order Summary Confirmation**
```json
POST {{baseUrl}}/ussd/hubtel
{
  "Type": "Response",
  "Mobile": "233262195121",
  "SessionId": "bundle_other_telecel_001",
  "ServiceCode": "*714*51",
  "Message": "1",
  "Operator": "airtel",
  "Sequence": 8,
  "ClientState": "",
  "Platform": "USSD"
}
```

---

## 🔧 TESTING SCENARIOS

### **1. Pagination Testing**
After Step 4 (Bundle Category Selection), test pagination:
- Send `"0"` to go to next page
- Send `"00"` to go to previous page
- Send `"99"` to go back to categories

### **2. Navigation Testing**
- Test `"99"` command at any step to go back
- Test invalid inputs (e.g., `"9"` when only 4 options available)
- Test mobile number validation (invalid formats)

### **3. Error Handling**
- Test with invalid session IDs
- Test with missing required fields
- Test with malformed JSON

### **4. Network-Specific Testing**
- Test all three networks (MTN, AT, Telecel)
- Verify different bundle categories per network
- Test bundle amounts and displays

---

## 📊 EXPECTED BUNDLE CATEGORIES

### **MTN Categories:**
1. Data Bundles
2. Kokrokoo Bundles  
3. Video Bundles
4. Social Media Bundles

### **AT Categories:**
1. BigTime Data
2. Fuse Bundles
3. Kokoo Bundles
4. XXL Family Bundles

### **Telecel Categories:**
1. No Expiry Bundles
2. Night Bundles
3. Hour Boost
4. Time-Based Bundles

---

## 🎯 TESTING CHECKLIST

- [ ] Self flow works for all networks
- [ ] Other flow works for all networks
- [ ] Bundle categories display correctly
- [ ] Bundle selection shows proper bundles
- [ ] Pagination works (Next/Previous)
- [ ] Navigation works (Back to Categories)
- [ ] Mobile number validation works
- [ ] Order summary displays correctly
- [ ] Payment confirmation works
- [ ] Error handling works
- [ ] Session management works
- [ ] Different SessionIds work independently

---

## 🚀 QUICK TEST COMMANDS

### **Self Flow (MTN):**
```
*714*51# → 2 → 1 → 1 → 4 → 1 → 1
```

### **Other Flow (AT):**
```
*714*51# → 2 → 3 → 1 → 5 → 2 → 0550982043 → 1
```

### **Other Flow (Telecel):**
```
*714*51# → 2 → 2 → 1 → 5 → 2 → 0241234567 → 1
```

---

## 📝 NOTES

1. **Session Management**: Use different SessionIds for each test to avoid conflicts
2. **Mobile Numbers**: Use valid Ghana mobile number formats (e.g., 0550982043, 0241234567)
3. **Bundle Display**: Bundles show as "Size - GH₵Amount" format
4. **Pagination**: 6 bundles per page with navigation controls
5. **Error Handling**: Invalid inputs return appropriate error messages
6. **Flow Completion**: Both flows end with payment processing confirmation

This comprehensive Postman flow covers all scenarios for testing the USSD bundle purchase functionality!
