# Configurable Withdrawal Amount

## Environment Variable Setup

Add this to your `.env` file to set the minimum withdrawal amount:

```env
# Minimum withdrawal amount in GHS (default: 0.5)
MIN_WITHDRAWAL_AMOUNT=1.00
```

## How to Change the Amount

### Option 1: Environment Variable (Recommended)
1. Update your `.env` file:
   ```env
   MIN_WITHDRAWAL_AMOUNT=2.50
   ```
2. Restart your application
3. The new minimum withdrawal amount will be applied immediately

### Option 2: Code Change
If you prefer to hardcode it, you can modify the withdrawal service:
```typescript
private readonly MIN_WITHDRAWAL_AMOUNT = 1.00; // Change this value
```

## Examples

- `MIN_WITHDRAWAL_AMOUNT=0.5` → Minimum GH 0.50
- `MIN_WITHDRAWAL_AMOUNT=1.0` → Minimum GH 1.00  
- `MIN_WITHDRAWAL_AMOUNT=5.0` → Minimum GH 5.00
- `MIN_WITHDRAWAL_AMOUNT=10.0` → Minimum GH 10.00

## Features

✅ **Dynamic Configuration**: Change anytime via environment variable
✅ **Consistent Across App**: Same amount used in all withdrawal checks
✅ **User-Friendly Messages**: Shows current minimum in all USSD responses
✅ **No Code Changes**: Just update environment variable and restart
