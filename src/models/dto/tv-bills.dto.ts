import { IsString, IsNumber, IsOptional, IsEnum, IsArray, IsObject } from 'class-validator';

export enum TVProvider {
  DSTV = 'DSTV',
  GOTV = 'GoTV',
  STARTIMES = 'StarTimes TV'
}

export interface TVAccountInfo {
  Display: string;
  Value: string;
  Amount: number;
}

export interface TVAccountQueryResponse {
  ResponseCode: string;
  Message: string;
  Label: string;
  Data: TVAccountInfo[];
}

export class TVAccountQueryDto {
  @IsString()
  accountNumber: string;

  @IsEnum(TVProvider)
  provider: TVProvider;
}

export class TVBillPaymentDto {
  @IsEnum(TVProvider)
  provider: TVProvider;

  @IsString()
  accountNumber: string;

  @IsNumber()
  amount: number;

  @IsString()
  @IsOptional()
  callbackUrl?: string;

  @IsString()
  clientReference: string;
}

export class TVBillPaymentRequestDto {
  @IsString()
  Destination: string;

  @IsNumber()
  Amount: number;

  @IsString()
  CallbackUrl: string;

  @IsString()
  ClientReference: string;
}

export class TVBillPaymentResponseDto {
  ResponseCode: string;
  Message: string;
  Data: {
    ClientReference: string;
    Amount: number;
    TransactionId: string;
    Meta: {
      Commission: string;
    };
  };
}

export class TVBillCallbackDto {
  @IsString()
  ResponseCode: string;

  @IsString()
  Message: string;

  @IsString()
  ClientReference: string;

  @IsString()
  TransactionId: string;

  @IsNumber()
  Amount: number;

  @IsString()
  @IsOptional()
  Commission?: string;
}
