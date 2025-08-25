import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Param, 
  BadRequestException,
  Query,
  NotFoundException
} from '@nestjs/common';
import { VouchersService } from '../services/vouchers.service';
import { 
  AssignVoucherDto, 
  PurchaseVoucherDto 
} from '../models/dto/voucher.dto';

@Controller('api/v1/vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Post('create')
  async createVoucher(@Body() body: { serial_number: string; pin: string }) {
    const voucher = await this.vouchersService.createVoucher(body.serial_number, body.pin);
    return {
      message: 'Voucher created successfully',
      voucher,
    };
  }

  @Post('create-bulk')
  async createVouchersBulk(@Body() body: { 
    serial_numbers: string[]; 
    pins: string[] 
  }) {
    if (!body.serial_numbers || !Array.isArray(body.serial_numbers)) {
      throw new BadRequestException('serial_numbers must be an array');
    }

    if (!body.pins || !Array.isArray(body.pins)) {
      throw new BadRequestException('pins must be an array');
    }

    const result = await this.vouchersService.createVouchersBulk(body.serial_numbers, body.pins);
    return {
      message: 'Bulk voucher creation completed',
      ...result,
    };
  }

  @Post('assign')
  async assignVoucher(@Body() assignDto: AssignVoucherDto) {
    const result = await this.vouchersService.assignVoucher(assignDto);
    return {
      message: 'Voucher assigned successfully',
      voucher: result,
    };
  }

  @Post('purchase')
  async purchaseVouchers(@Body() purchaseDto: PurchaseVoucherDto) {
    const result = await this.vouchersService.purchaseVouchers(purchaseDto);
    return result;
  }

  @Get('available')
  async getAvailableVouchers() {
    return await this.vouchersService.getAvailableVouchers();
  }

  @Get('assigned/:mobileNumber')
  async getAssignedVouchers(@Param('mobileNumber') mobileNumber: string) {
    const vouchers = await this.vouchersService.getAssignedVouchers(mobileNumber);
    return {
      mobile_number: mobileNumber,
      count: vouchers.length,
      vouchers,
    };
  }

  @Post('use/:serialNumber')
  async useVoucher(@Param('serialNumber') serialNumber: string) {
    const result = await this.vouchersService.useVoucher(serialNumber);
    return result;
  }

  @Get('check/:serialNumber')
  async checkVoucherExists(@Param('serialNumber') serialNumber: string) {
    const exists = await this.vouchersService.checkVoucherExists(serialNumber);
    return {
      serial_number: serialNumber,
      exists,
      message: exists ? 'Voucher already exists' : 'Voucher serial number is available'
    };
  }

  @Get('search/serial/:serialNumber')
  async getVoucherBySerialNumber(@Param('serialNumber') serialNumber: string) {
    const voucher = await this.vouchersService.getVoucherBySerialNumber(serialNumber);
    if (!voucher) {
      throw new NotFoundException('Voucher not found with this serial number');
    }
    return {
      message: 'Voucher found',
      voucher,
    };
  }

  @Get('search/pin/:pin')
  async getVoucherByPin(@Param('pin') pin: string) {
    const voucher = await this.vouchersService.getVoucherByPin(pin);
    if (!voucher) {
      throw new NotFoundException('Voucher not found with this PIN');
    }
    return {
      message: 'Voucher found',
      voucher,
    };
  }

  @Post('mark-sold/:serialNumber')
  async markVoucherAsSold(@Param('serialNumber') serialNumber: string) {
    const result = await this.vouchersService.markVoucherAsSold(serialNumber);
    return result;
  }

  @Get('stats')
  async getVoucherStats() {
    return await this.vouchersService.getVoucherStats();
  }
}
