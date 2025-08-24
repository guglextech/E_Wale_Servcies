import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Param, 
  UseInterceptors, 
  UploadedFile, 
  BadRequestException,
  Query
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VouchersService } from '../services/vouchers.service';
import { 
  ImportVoucherDto, 
  AssignVoucherDto, 
  PurchaseVoucherDto 
} from '../models/dto/voucher.dto';

@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Post('import/excel')
  @UseInterceptors(FileInterceptor('file'))
  async importVouchersFromExcel(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    
    // Validate file type
    if (!file.mimetype.includes('excel') && !file.mimetype.includes('spreadsheet')) {
      throw new BadRequestException('Only Excel files are allowed');
    }
    
    const result = await this.vouchersService.importVouchersFromExcel(file.buffer);
    return {
      message: 'Vouchers import completed',
      ...result,
    };
  }

  @Post('import/array')
  async importVouchersFromArray(@Body() importDto: ImportVoucherDto) {
    const result = await this.vouchersService.importVouchersFromArray(importDto.voucher_codes);
    return {
      message: 'Vouchers import completed',
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
