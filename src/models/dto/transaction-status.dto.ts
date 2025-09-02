import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export enum TransactionStatus {
  PAID = 'Paid',
  UNPAID = 'Unpaid',
  PENDING = 'Pending',
  FAILED = 'Failed'
}

export enum ResponseCode {
  SUCCESS = '0000',
  PENDING = '0001',
  HTTP_FAILURE = '0005',
  GENERAL_FAILURE = '2000',
  GENERAL_FAILURE_2 = '2001',
  ERROR_RETRY = '4000',
  VALIDATION_ERROR = '4010',
  AUTH_DENIED = '4101',
  PERMISSION_DENIED = '4103',
  INSUFFICIENT_BALANCE = '4075'
}

export class TransactionStatusQueryDto {
  @IsString()
  @IsOptional()
  clientReference?: string;

  @IsString()
  @IsOptional()
  hubtelTransactionId?: string;

  @IsString()
  @IsOptional()
  networkTransactionId?: string;
}

export class TransactionStatusDataDto {
  @IsString()
  date: string;

  @IsString()
  status: 'Paid' | 'Unpaid';

  @IsString()
  transactionId: string;

  @IsString()
  @IsOptional()
  externalTransactionId?: string;

  @IsString()
  paymentMethod: string;

  @IsString()
  clientReference: string;

  @IsString()
  @IsOptional()
  currencyCode?: string;

  @IsNumber()
  amount: number;

  @IsNumber()
  charges: number;

  @IsNumber()
  amountAfterCharges: number;

  @IsBoolean()
  @IsOptional()
  isFulfilled?: boolean;
}

export class TransactionStatusResponseDto {
  @IsString()
  message: string;

  @IsString()
  responseCode: string;

  @IsString()
  data: TransactionStatusDataDto;
}
