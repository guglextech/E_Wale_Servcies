export interface CommissionTransactionLogData {
  clientReference: string;
  hubtelTransactionId?: string;
  externalTransactionId?: string;
  mobileNumber: string;
  sessionId: string;
  serviceType: string;
  network?: string;
  tvProvider?: string;
  utilityProvider?: string;
  bundleValue?: string;
  selectedBundle?: any;
  accountNumber?: string;
  meterNumber?: string;
  amount: number;
  commission?: number;
  charges?: number;
  amountAfterCharges?: number;
  currencyCode?: string;
  paymentMethod?: string;
  status: string;
  isFulfilled?: boolean;
  responseCode?: string;
  message?: string;
  commissionServiceStatus?: string;
  commissionServiceMessage?: string;
  transactionDate?: Date;
  commissionServiceDate?: Date;
  errorMessage?: string;
  retryCount?: number;
  isRetryable?: boolean;
  lastRetryAt?: Date;
}

export interface TransactionStatusResponse {
  message: string;
  responseCode: string;
  data: {
    date: string;
    status: string;
    transactionId: string;
    externalTransactionId: string | null;
    paymentMethod: string;
    clientReference: string;
    currencyCode: string | null;
    amount: number;
    charges: number;
    amountAfterCharges: number;
    isFulfilled: boolean | null;
  };
}

export interface CommissionServiceRequest {
  clientReference: string;
  amount: number;
  callbackUrl: string;
  serviceType: 'bundle' | 'airtime' | 'tv_bill' | 'utility';
  network?: string;
  destination: string;
  tvProvider?: string;
  utilityProvider?: string;
  extraData: Record<string, any>;
}

export interface CommissionServiceResponse {
  ResponseCode: string;
  Status: string;
  Data: {
    ClientReference: string;
    TransactionId: string;
    ExternalTransactionId: string;
    Amount: number;
    Charges: number;
    AmountAfterCharges: number;
    CurrencyCode: string;
    PaymentMethod: string;
    IsSuccessful: boolean;
    IsFulfilled: boolean;
    Message: string;
  };
  IsSuccessful: boolean;
  IsFulfilled: boolean;
  Message: string;
}

export interface CommissionTransactionStats {
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  pendingTransactions: number;
  deliveredServices: number;
  failedServices: number;
  pendingServices: number;
  successRate: string;
  deliveryRate: string;
  totalAmount: number;
  totalCharges: number;
  totalAmountAfterCharges: number;
}

export interface PaginatedCommissionLogs {
  logs: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
