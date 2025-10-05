export interface CommissionTransactionLogData {
  SessionId: string;
  OrderId: string;
  clientReference: string;
  hubtelTransactionId?: string;
  externalTransactionId?: string;
  mobileNumber: string;
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
  description?: string;
  transactionDate?: Date;
  errorMessage?: string;
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
  Data: {
    AmountDebited: number;
    TransactionId: string;
    ClientReference: string;
    Description: string;
    ExternalTransactionId: string;
    Amount: number;
    Charges: number;
    Meta: {
      Commission: string;
    };
    RecipientName?: string;
  };
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
