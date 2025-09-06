import { IsString, IsNumber, IsOptional, IsEnum, IsArray, IsObject } from 'class-validator';

export enum NetworkProvider {
  MTN = 'MTN',
  TELECEL = 'Telecel Ghana',
  AT = 'AT'
}

export enum BundleType {
  DATA = 'Data Bundle',
  VOICE = 'Voice Bundle',
  AIRTIME = 'Airtime Top-Up',
  FIBRE = 'Fibre Broadband',
  BROADBAND = 'Broadband'
}

export interface BundleOption {
  Display: string;
  Value: string;
  Amount: number;
}

export interface BundleQueryResponse {
  ResponseCode: string;
  Message: string;
  Label: string;
  Data: BundleOption[];
  Groups?: { [key: string]: BundleOption[] };
}

export class BundleQueryDto {
  @IsString()
  destination: string;

  @IsEnum(NetworkProvider)
  network: NetworkProvider;

  @IsOptional()
  @IsString()
  bundleType?: string;
}

export class BundlePurchaseDto {
  @IsEnum(BundleType)
  bundleType: BundleType;

  @IsEnum(NetworkProvider)
  network: NetworkProvider;

  @IsString()
  destination: string;

  @IsString()
  bundleValue: string;

  @IsNumber()
  amount: number;

  @IsString()
  callbackUrl: string;

  @IsString()
  clientReference: string;
}

export class BundlePurchaseRequestDto {
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

export class AirtimeTopUpDto {
  @IsString()
  destination: string;

  @IsNumber()
  amount: number;

  @IsString()
  callbackUrl: string;

  @IsString()
  clientReference: string;

  @IsEnum(NetworkProvider)
  network: NetworkProvider;
}

export class HubtelAirtimeResponseDto {
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

export class AirtimeCallbackDto {
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
