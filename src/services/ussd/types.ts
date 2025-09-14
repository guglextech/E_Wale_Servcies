import { NetworkProvider, BundleType } from "../../models/dto/airtime.dto";
import { BundleOption } from "../../models/dto/bundle.dto";
import { TVProvider, TVAccountInfo, TVAccountQueryResponse } from "../../models/dto/tv-bills.dto";
import { UtilityProvider, UtilityMeterInfo } from "../../models/dto/utility.dto";

export interface SessionState {
  service?: string;
  serviceType?: string; 
  mobile?: string;
  name?: string;
  quantity?: number;
  flow?: "self" | "other";
  totalAmount?: number;
  assignedVoucherCodes?: string[];
  network?: NetworkProvider;
  bundleType?: BundleType;
  amount?: number;
  // Bundle specific fields
  bundles?: BundleOption[];
  allBundles?: BundleOption[];
  bundleGroups?: Array<{ name: string; bundles: BundleOption[] }>;
  currentBundlePage?: number;
  currentGroupIndex?: number;
  selectedBundle?: BundleOption;
  bundleValue?: string;
  isInCategorySelectionMode?: boolean; 
  // TV Bills specific fields
  tvProvider?: TVProvider;
  accountNumber?: string;
  accountInfo?: TVAccountQueryResponse[];
  subscriptionType?: 'renew' | 'change';
  // Utility specific fields
  utilityProvider?: UtilityProvider;
  meterNumber?: string;
  meterInfo?: UtilityMeterInfo[];
  selectedMeter?: UtilityMeterInfo;
  email?: string;
  sessionId?: string;
}

export interface UssdResponse {
  SessionId: string;
  Type: string;
  Label: string;
  Message: string;
  DataType: string;
  FieldType: string;
}

export interface CommissionServiceRequest {
  clientReference: string;
  amount: number;
  callbackUrl: string;
  serviceType: 'bundle' | 'airtime' | 'tv_bill' | 'utility';
  network?: NetworkProvider;
  destination: string;
  tvProvider?: TVProvider;
  utilityProvider?: UtilityProvider;
  extraData: Record<string, any>;
}

export interface MobileValidationResult {
  isValid: boolean;
  convertedNumber?: string;
  error?: string;
}

export interface BundlePaginationResult {
  items: BundleOption[];
  currentPage: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface UssdLogData {
  mobileNumber: string;
  sessionId: string;
  sequence: number;
  message: string;
  serviceType?: string;
  service?: string;
  flow?: string;
  network?: string;
  amount?: number;
  totalAmount?: number;
  quantity?: number;
  recipientName?: string;
  recipientMobile?: string;
  tvProvider?: string;
  accountNumber?: string;
  utilityProvider?: string;
  meterNumber?: string;
  bundleValue?: string;
  selectedBundle?: any;
  accountInfo?: any;
  meterInfo?: any;
  status: string;
  userAgent: string;
  deviceInfo: string;
  location: string;
  dialedAt?: Date;
}

export interface UssdStatistics {
  totalDialers: number;
  todayDialers: number;
  completedTransactions: number;
  failedTransactions: number;
  successRate: string;
}

export interface PaginatedUssdLogs {
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

export enum ServiceType {
  RESULT_CHECKER = 'result_checker',
  DATA_BUNDLE = 'data_bundle',
  VOICE_BUNDLE = 'voice_bundle',
  AIRTIME_TOPUP = 'airtime_topup',
  PAY_BILLS = 'pay_bills',
  UTILITY_SERVICE = 'utility_service'
}

export enum FlowType {
  SELF = 'self',
  OTHER = 'other'
}

export interface ServicePrice {
  [key: string]: number;
}
