import { IsString, IsNumber, IsOptional } from 'class-validator';

export class AssignVoucherDto {
  @IsString()
  serial_number: string;

  @IsString()
  mobile_number: string;
}

export class PurchaseVoucherDto {
  @IsString()
  mobile_number: string;

  @IsString()
  name: string;

  @IsNumber()
  quantity: number;

  @IsString()
  flow: 'self' | 'other';

  @IsOptional()
  @IsString()
  bought_for_mobile?: string;

  @IsOptional()
  @IsString()
  bought_for_name?: string;

  @IsOptional()
  @IsString()
  voucherType?: string;
}

export class VoucherResponseDto {
  serial_number: string;
  pin: string;
  mobile_number_assigned: string;
  assigned_date: Date;
  sold: boolean;
}
