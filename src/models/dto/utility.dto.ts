import { IsString, IsNumber, IsOptional, IsEnum, IsArray, IsObject, IsEmail } from 'class-validator';

export enum UtilityProvider {
  ECG = 'ECG Prepaid',
  GHANA_WATER = 'Ghana Water'
}

export interface UtilityMeterInfo {
  Display: string;
  Value: string;
  Amount: number;
}

export interface UtilityQueryResponse {
  ResponseCode: string;
  Message: string;
  Label: string;
  Data: UtilityMeterInfo[];
}

export class ECGMeterQueryDto {
  @IsString()
  mobileNumber: string;
}

export class GhanaWaterQueryDto {
  @IsString()
  meterNumber: string;

  @IsString()
  mobileNumber: string;
}

export class ECGTopUpDto {
  @IsString()
  mobileNumber: string;

  @IsString()
  meterNumber: string;

  @IsNumber()
  amount: number;

  @IsString()
  @IsOptional()
  callbackUrl?: string;

  @IsString()
  clientReference: string;
}

export class GhanaWaterTopUpDto {
  @IsString()
  meterNumber: string;

  @IsEmail()
  email: string;

  @IsString()
  sessionId: string;

  @IsNumber()
  amount: number;

  @IsString()
  @IsOptional()
  callbackUrl?: string;

  @IsString()
  clientReference: string;
}

export class ECGTopUpRequestDto {
  @IsString()
  Destination: string;

  @IsNumber()
  Amount: number;

  @IsString()
  CallbackUrl: string;

  @IsString()
  ClientReference: string;

  @IsObject()
  Extradata: {
    bundle: string;
  };
}

export class GhanaWaterTopUpRequestDto {
  @IsString()
  Destination: string;

  @IsNumber()
  Amount: number;

  @IsObject()
  Extradata: {
    bundle: string;
    Email: string;
    SessionId: string;
  };

  @IsString()
  CallbackUrl: string;

  @IsString()
  ClientReference: string;
}

export class UtilityTopUpResponseDto {
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

export class UtilityCallbackDto {
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
