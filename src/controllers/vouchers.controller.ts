import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Param, 
  BadRequestException,
  Query
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
  async createVoucher(@Body() body: { voucher_code: string }) {
    const voucher = await this.vouchersService.createVoucher(body.voucher_code);
    return {
      message: 'Voucher created successfully',
      voucher,
    };
  }

  @Post('create-bulk')
  async createVouchersBulk(@Body() body: { voucher_codes: string[] }) {
    if (!body.voucher_codes || !Array.isArray(body.voucher_codes)) {
      throw new BadRequestException('voucher_codes must be an array');
    }

    const result = await this.vouchersService.createVouchersBulk(body.voucher_codes);
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

  @Post('use/:voucherCode')
  async useVoucher(@Param('voucherCode') voucherCode: string) {
    const result = await this.vouchersService.useVoucher(voucherCode);
    return result;
  }

  @Post('send-sms-after-payment')
  async sendSmsAfterPayment(@Body() body: {
    mobile_number: string;
    name: string;
    flow: 'self' | 'other';
    bought_for_name?: string;
    bought_for_mobile?: string;
  }) {
    const result = await this.vouchersService.sendVoucherSmsAfterPayment(
      body.mobile_number,
      {
        name: body.name,
        flow: body.flow,
        bought_for_name: body.bought_for_name,
        bought_for_mobile: body.bought_for_mobile,
      }
    );
    
    return {
      message: 'SMS sent successfully after payment confirmation',
      success: result,
    };
  }

  @Get('check/:voucherCode')
  async checkVoucherExists(@Param('voucherCode') voucherCode: string) {
    const exists = await this.vouchersService.checkVoucherExists(voucherCode);
    return {
      voucher_code: voucherCode,
      exists,
      message: exists ? 'Voucher already exists' : 'Voucher code is available'
    };
  }

  @Get('stats')
  async getVoucherStats() {
    return await this.vouchersService.getVoucherStats();
  }

  @Get('search')
  async searchVouchers(@Query('code') code?: string, @Query('mobile') mobile?: string) {
    if (code) {
      const voucher = await this.vouchersService['voucherModel'].findOne({ voucher_code: code });
      return voucher ? { voucher } : { message: 'Voucher not found' };
    }
    
    if (mobile) {
      const vouchers = await this.vouchersService.getAssignedVouchers(mobile);
      return { mobile_number: mobile, vouchers };
    }
    
    throw new BadRequestException('Please provide either code or mobile parameter');
  }
}
