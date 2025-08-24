import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Voucher } from '../models/schemas/voucher.schema';
import { AssignVoucherDto, PurchaseVoucherDto, VoucherResponseDto } from '../models/dto/voucher.dto';
import { sendVoucherSms } from '../utils/sendSMS';

@Injectable()
export class VouchersService {
  constructor(
    @InjectModel(Voucher.name) private voucherModel: Model<Voucher>,
  ) {}

  async createVoucher(voucherCode: string): Promise<Voucher> {
    // Normalize voucher code (trim whitespace, convert to uppercase)
    const normalizedCode = voucherCode.trim().toUpperCase();
    
    if (!normalizedCode || normalizedCode.length < 3) {
      throw new BadRequestException('Voucher code must be at least 3 characters long');
    }

    // Check for existing voucher with case-insensitive comparison
    const existingVoucher = await this.voucherModel.findOne({ 
      voucher_code: { $regex: new RegExp(`^${normalizedCode}$`, 'i') }
    });
    
    if (existingVoucher) {
      throw new BadRequestException(`Voucher ${normalizedCode} already exists`);
    }

    try {
      const voucher = new this.voucherModel({
        voucher_code: normalizedCode,
        date: new Date(),
        used: false,
      });
      
      return await voucher.save();
    } catch (error) {
      // Handle MongoDB duplicate key error
      if (error.code === 11000) {
        throw new BadRequestException(`Voucher ${normalizedCode} already exists`);
      }
      throw error;
    }
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

    // Note: SMS will be sent separately after payment confirmation
    const message = purchaseDto.flow === 'other' 
      ? `Successfully assigned ${purchaseDto.quantity} voucher(s) for ${purchaseDto.bought_for_name} (${purchaseDto.bought_for_mobile})`
      : `Successfully assigned ${purchaseDto.quantity} voucher(s) for yourself`;

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

  async checkVoucherExists(voucherCode: string): Promise<boolean> {
    const normalizedCode = voucherCode.trim().toUpperCase();
    const existingVoucher = await this.voucherModel.findOne({ 
      voucher_code: { $regex: new RegExp(`^${normalizedCode}$`, 'i') }
    });
    return !!existingVoucher;
  }

  async createVouchersBulk(voucherCodes: string[]): Promise<{
    success: number;
    failed: number;
    duplicates: string[];
    errors: string[];
  }> {
    const results = {
      success: 0,
      failed: 0,
      duplicates: [] as string[],
      errors: [] as string[]
    };

    for (const code of voucherCodes) {
      try {
        const normalizedCode = code.trim().toUpperCase();
        
        if (!normalizedCode || normalizedCode.length < 3) {
          results.errors.push(`Invalid voucher code: ${code}`);
          results.failed++;
          continue;
        }

        // Check if voucher already exists
        const exists = await this.checkVoucherExists(normalizedCode);
        if (exists) {
          results.duplicates.push(normalizedCode);
          results.failed++;
          continue;
        }

        // Create voucher
        const voucher = new this.voucherModel({
          voucher_code: normalizedCode,
          date: new Date(),
          used: false,
        });
        
        await voucher.save();
        results.success++;
        
      } catch (error) {
        if (error.code === 11000) {
          // MongoDB duplicate key error
          results.duplicates.push(code);
        } else {
          results.errors.push(`Failed to create voucher ${code}: ${error.message}`);
        }
        results.failed++;
      }
    }

    return results;
  }

  async sendVoucherSmsAfterPayment(mobileNumber: string, purchaseData: {
    name: string;
    flow: 'self' | 'other';
    bought_for_name?: string;
    bought_for_mobile?: string;
  }): Promise<boolean> {
    const vouchers = await this.voucherModel.find({ 
      mobile_number_assigned: mobileNumber,
      used: false
    });

    if (vouchers.length === 0) {
      throw new NotFoundException('No vouchers found for this mobile number');
    }

    const voucherCodes = vouchers.map(v => v.voucher_code);

    if (purchaseData.flow === 'other') {
      // Send to the person the voucher was bought for
      return await sendVoucherSms({
        mobile: purchaseData.bought_for_mobile,
        name: purchaseData.bought_for_name,
        voucher_codes: voucherCodes,
        flow: 'other',
        buyer_name: purchaseData.name,
        buyer_mobile: mobileNumber,
      });
    } else {
      // Send to the buyer
      return await sendVoucherSms({
        mobile: mobileNumber,
        name: purchaseData.name,
        voucher_codes: voucherCodes,
        flow: 'self',
      });
    }
  }

  async getAllPaidVouchers(): Promise<{ count: number; vouchers: Voucher[] }> {
    const vouchers = await this.voucherModel.find({
      paymentStatus: 'Paid',
      isSuccessful: true,
    }).exec();
  
    return {
      count: vouchers.length,
      vouchers,
    };
  }

  async searchVoucher(query: string): Promise<Voucher[]> {
    return await this.voucherModel.find({
      paymentStatus: 'Paid',
      isSuccessful: true,
      $or: [
        { mobile: query },
        { voucher_code: query }
      ]
    }).exec();
  }

  async createVoucherFromPurchase(purchaseData: {
    user: Types.ObjectId;
    SessionId: string;
    mobile: string;
    name: string;
    packageType: string;
    quantity: number;
    flow: string;
    initialAmount: number;
    boughtForMobile: string;
    boughtForName: string;
    paymentStatus: string;
    isSuccessful: boolean;
  }): Promise<Voucher> {
    const voucher = new this.voucherModel({
      ...purchaseData,
      date: new Date(),
      used: false,
      isVerifiedVoucher: false,
    });
    
    return await voucher.save();
  }

  async updateVoucherPaymentStatus(SessionId: string, paymentData: {
    paymentStatus: string;
    isSuccessful: boolean;
    name: string;
  }): Promise<Voucher> {
    return await this.voucherModel.findOneAndUpdate(
      { SessionId },
      {
        $set: {
          paymentStatus: paymentData.paymentStatus,
          isSuccessful: paymentData.isSuccessful,
          name: paymentData.name
        }
      },
      { new: true }
    );
  }

  async markVoucherAsVerified(SessionId: string): Promise<Voucher> {
    return await this.voucherModel.findOneAndUpdate(
      { SessionId },
      { $set: { isVerifiedVoucher: true } },
      { new: true }
    );
  }
}
