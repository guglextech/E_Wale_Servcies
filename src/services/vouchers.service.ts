import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Voucher } from '../models/schemas/voucher.schema';
import { Ticket } from '../models/schemas/ticket.schema';
import { ImportVoucherDto, AssignVoucherDto, PurchaseVoucherDto, VoucherResponseDto } from '../models/dto/voucher.dto';
import * as ExcelJS from 'exceljs';
import { sendVoucherSms } from '../utils/sendSMS';

@Injectable()
export class VouchersService {
  constructor(
    @InjectModel(Voucher.name) private voucherModel: Model<Voucher>,
    @InjectModel(Ticket.name) private ticketModel: Model<Ticket>,
  ) {}

  async importVouchersFromExcel(fileBuffer: Buffer): Promise<{ success: number; failed: number; errors: string[] }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);
    
    const worksheet = workbook.getWorksheet(1);
    const voucherCodes: string[] = [];
    const errors: string[] = [];
    
    // Read voucher codes from Excel (assuming first column contains codes)
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) { // Skip header row
        const voucherCode = row.getCell(1).value?.toString();
        if (voucherCode && voucherCode.trim()) {
          voucherCodes.push(voucherCode.trim());
        }
      }
    });

    let success = 0;
    let failed = 0;

    // Import vouchers to database
    for (const code of voucherCodes) {
      try {
        const existingVoucher = await this.voucherModel.findOne({ voucher_code: code });
        if (existingVoucher) {
          errors.push(`Voucher ${code} already exists`);
          failed++;
          continue;
        }

        const voucher = new this.voucherModel({
          voucher_code: code,
          date: new Date(),
          used: false,
        });
        
        await voucher.save();
        success++;
      } catch (error) {
        errors.push(`Failed to import voucher ${code}: ${error.message}`);
        failed++;
      }
    }

    return { success, failed, errors };
  }

  async importVouchersFromArray(voucherCodes: string[]): Promise<{ success: number; failed: number; errors: string[] }> {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const code of voucherCodes) {
      try {
        const existingVoucher = await this.voucherModel.findOne({ voucher_code: code });
        if (existingVoucher) {
          errors.push(`Voucher ${code} already exists`);
          failed++;
          continue;
        }

        const voucher = new this.voucherModel({
          voucher_code: code,
          date: new Date(),
          used: false,
        });
        
        await voucher.save();
        success++;
      } catch (error) {
        errors.push(`Failed to import voucher ${code}: ${error.message}`);
        failed++;
      }
    }

    return { success, failed, errors };
  }

  async assignVoucher(assignDto: AssignVoucherDto): Promise<VoucherResponseDto> {
    const voucher = await this.voucherModel.findOne({ 
      voucher_code: assignDto.voucher_code,
      used: false 
    });

    if (!voucher) {
      throw new NotFoundException('Voucher not found or already used');
    }

    voucher.mobile_number_assigned = assignDto.mobile_number;
    voucher.assigned_date = new Date();
    await voucher.save();

    return {
      voucher_code: voucher.voucher_code,
      mobile_number_assigned: voucher.mobile_number_assigned,
      assigned_date: voucher.assigned_date,
      used: voucher.used,
    };
  }

  async purchaseVouchers(purchaseDto: PurchaseVoucherDto): Promise<{ 
    success: boolean; 
    assigned_vouchers: VoucherResponseDto[]; 
    message: string 
  }> {
    // Check if we have enough available vouchers
    const availableVouchers = await this.voucherModel.find({ 
      used: false,
      mobile_number_assigned: { $exists: false }
    }).limit(purchaseDto.quantity);

    if (availableVouchers.length < purchaseDto.quantity) {
      throw new BadRequestException(`Only ${availableVouchers.length} vouchers available. Requested: ${purchaseDto.quantity}`);
    }

    const assignedVouchers: VoucherResponseDto[] = [];
    const mobileNumber = purchaseDto.flow === 'other' ? purchaseDto.bought_for_mobile : purchaseDto.mobile_number;

    // Assign vouchers
    for (let i = 0; i < purchaseDto.quantity; i++) {
      const voucher = availableVouchers[i];
      voucher.mobile_number_assigned = mobileNumber;
      voucher.assigned_date = new Date();
      await voucher.save();

      assignedVouchers.push({
        voucher_code: voucher.voucher_code,
        mobile_number_assigned: voucher.mobile_number_assigned,
        assigned_date: voucher.assigned_date,
        used: voucher.used,
      });
    }

    // Send SMS notifications
    if (purchaseDto.flow === 'other') {
      // Send to the person the voucher was bought for
      await sendVoucherSms({
        mobile: purchaseDto.bought_for_mobile,
        name: purchaseDto.bought_for_name,
        voucher_codes: assignedVouchers.map(v => v.voucher_code),
        flow: 'other',
        buyer_name: purchaseDto.name,
        buyer_mobile: purchaseDto.mobile_number,
      });
    } else {
      // Send to the buyer
      await sendVoucherSms({
        mobile: purchaseDto.mobile_number,
        name: purchaseDto.name,
        voucher_codes: assignedVouchers.map(v => v.voucher_code),
        flow: 'self',
      });
    }

    const message = purchaseDto.flow === 'other' 
      ? `Successfully purchased ${purchaseDto.quantity} voucher(s) for ${purchaseDto.bought_for_name} (${purchaseDto.bought_for_mobile})`
      : `Successfully purchased ${purchaseDto.quantity} voucher(s) for yourself`;

    return {
      success: true,
      assigned_vouchers: assignedVouchers,
      message,
    };
  }

  async getAvailableVouchers(): Promise<{ count: number; vouchers: VoucherResponseDto[] }> {
    const vouchers = await this.voucherModel.find({ 
      used: false,
      mobile_number_assigned: { $exists: false }
    });

    return {
      count: vouchers.length,
      vouchers: vouchers.map(v => ({
        voucher_code: v.voucher_code,
        mobile_number_assigned: v.mobile_number_assigned,
        assigned_date: v.assigned_date,
        used: v.used,
      })),
    };
  }

  async getAssignedVouchers(mobileNumber: string): Promise<VoucherResponseDto[]> {
    const vouchers = await this.voucherModel.find({ 
      mobile_number_assigned: mobileNumber 
    });

    return vouchers.map(v => ({
      voucher_code: v.voucher_code,
      mobile_number_assigned: v.mobile_number_assigned,
      assigned_date: v.assigned_date,
      used: v.used,
    }));
  }

  async useVoucher(voucherCode: string): Promise<{ success: boolean; message: string }> {
    const voucher = await this.voucherModel.findOne({ voucher_code: voucherCode });
    
    if (!voucher) {
      throw new NotFoundException('Voucher not found');
    }

    if (voucher.used) {
      throw new BadRequestException('Voucher already used');
    }

    if (!voucher.mobile_number_assigned) {
      throw new BadRequestException('Voucher not assigned to any mobile number');
    }

    voucher.used = true;
    await voucher.save();

    return {
      success: true,
      message: `Voucher ${voucherCode} has been used successfully`,
    };
  }

  async getVoucherStats(): Promise<{
    total: number;
    available: number;
    assigned: number;
    used: number;
  }> {
    const [total, available, assigned, used] = await Promise.all([
      this.voucherModel.countDocuments(),
      this.voucherModel.countDocuments({ 
        used: false, 
        mobile_number_assigned: { $exists: false } 
      }),
      this.voucherModel.countDocuments({ 
        mobile_number_assigned: { $exists: true },
        used: false 
      }),
      this.voucherModel.countDocuments({ used: true }),
    ]);

    return { total, available, assigned, used };
  }
}
