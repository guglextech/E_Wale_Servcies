import { IsString, IsNumber, IsOptional, IsArray, IsBoolean } from 'class-validator';

export class ImportVoucherDto {
  @IsArray()
  @IsString({ each: true })
  voucher_codes: string[];
}

export class AssignVoucherDto {
  @IsString()
  voucher_code: string;

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
}

export class VoucherResponseDto {
  voucher_code: string;
  mobile_number_assigned: string;
  assigned_date: Date;
  used: boolean;
}
