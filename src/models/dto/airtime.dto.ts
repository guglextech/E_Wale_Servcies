import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';

export enum NetworkProvider {
  MTN = 'MTN',
  TELECEL = 'Telecel Ghana',
  AT = 'AT'
}

export enum BundleType {
  DATA = 'Data Bundle',
  VOICE = 'Voice Bundle',
  AIRTIME = 'Airtime Top-Up'
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

export class BundlePurchaseDto {
  @IsEnum(BundleType)
  bundleType: BundleType;

  @IsEnum(NetworkProvider)
  network: NetworkProvider;

  @IsString()
  destination: string;

  @IsNumber()
  quantity: number;

  @IsString()
  callbackUrl: string;

  @IsString()
  clientReference: string;
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
