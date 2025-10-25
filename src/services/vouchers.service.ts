import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Voucher } from '../models/schemas/voucher.schema';
import { AssignVoucherDto, PurchaseVoucherDto, VoucherResponseDto } from '../models/dto/voucher.dto';
// import { sendVoucherSms } from '../utils/sendSMS';

@Injectable()
export class VouchersService {
  constructor(
    @InjectModel(Voucher.name) private voucherModel: Model<Voucher>,
  ) {}

  async createVoucher(serialNumber: string, pin: string, voucherType: string = 'BECE'): Promise<Voucher> {
    // Normalize serial number (trim whitespace, convert to uppercase)
    const normalizedSerialNumber = serialNumber.trim().toUpperCase();
    
    if (!normalizedSerialNumber) {
      throw new BadRequestException('Serial number is required');
    }

    if (!pin) {
      throw new BadRequestException('PIN is required');
    }

    // Check for existing voucher with case-insensitive comparison
    const existingVoucher = await this.voucherModel.findOne({ 
      serial_number: { $regex: new RegExp(`^${normalizedSerialNumber}$`, 'i') }
    });
    
    if (existingVoucher) {
      throw new BadRequestException(`Voucher with serial number ${normalizedSerialNumber} already exists`);
    }

    try {
      const voucher = new this.voucherModel({
        serial_number: normalizedSerialNumber,
        pin: pin.trim(),
        date: new Date(),
        sold: false,
        voucherType: voucherType,
      });
      
      return await voucher.save();
    } catch (error) {
      // Handle MongoDB duplicate key error
      if (error.code === 11000) {
        throw new BadRequestException(`Voucher with serial number ${normalizedSerialNumber} already exists`);
      }
      throw error;
    }
  }

  async assignVoucher(assignDto: AssignVoucherDto): Promise<VoucherResponseDto> {
    const voucher = await this.voucherModel.findOne({ 
      serial_number: { $regex: new RegExp(`^${assignDto.serial_number}$`, 'i') }
    });

    if (!voucher) {
      throw new NotFoundException('Voucher not found');
    }

    if (voucher.sold) {
      throw new BadRequestException('Voucher already sold');
    }

    if (voucher.mobile_number_assigned) {
      throw new BadRequestException('Voucher already assigned to another mobile number');
    }

    voucher.mobile_number_assigned = assignDto.mobile_number;
    voucher.assigned_date = new Date();
    await voucher.save();

    return {
      serial_number: voucher.serial_number,
      pin: voucher.pin,
      mobile_number_assigned: voucher.mobile_number_assigned,
      assigned_date: voucher.assigned_date,
      sold: voucher.sold,
    };
  }

  async purchaseVouchers(purchaseDto: PurchaseVoucherDto): Promise<{ 
    success: boolean; 
    assigned_vouchers: VoucherResponseDto[]; 
    message: string 
  }> {
    // Determine voucher type based on service
    const voucherType = this.getVoucherTypeFromService(purchaseDto.voucherType);
    
    // Check if we have enough available vouchers of the specified type
    // Handle legacy BECE vouchers that don't have voucherType field
    const query: any = {
      sold: false,
      mobile_number_assigned: { $exists: false }
    };
    
    if (voucherType === 'BECE') {
      // For BECE: include both vouchers with voucherType='BECE' AND vouchers without voucherType (legacy)
      query.$or = [
        { voucherType: 'BECE' },
        { voucherType: { $exists: false } }
      ];
    } else {
      // For other types (WASSCE, etc.): exact match required
      query.voucherType = voucherType;
    }
    
    const availableVouchers = await this.voucherModel.find(query).limit(purchaseDto.quantity);

    if (availableVouchers.length < purchaseDto.quantity) {
      throw new BadRequestException(`Only ${availableVouchers.length} ${voucherType} vouchers available. Requested: ${purchaseDto.quantity}`);
    }

    const assignedVouchers: VoucherResponseDto[] = [];
    const mobileNumber = purchaseDto.flow === 'other' ? purchaseDto.bought_for_mobile : purchaseDto.mobile_number;

    // Assign vouchers
    for (let i = 0; i < purchaseDto.quantity; i++) {
      const voucher = availableVouchers[i];
      voucher.mobile_number_assigned = mobileNumber;
      voucher.assigned_date = new Date();
      
      // Update legacy vouchers to have proper voucherType
      if (!voucher.voucherType) {
        voucher.voucherType = voucherType;
      }
      
      await voucher.save();

      assignedVouchers.push({
        serial_number: voucher.serial_number,
        pin: voucher.pin,
        mobile_number_assigned: voucher.mobile_number_assigned,
        assigned_date: voucher.assigned_date,
        sold: voucher.sold,
      });
    }

    // Note: SMS will be sent separately after payment confirmation
    const message = purchaseDto.flow === 'other' 
      ? `Successfully assigned ${purchaseDto.quantity} ${voucherType} voucher(s) for ${purchaseDto.bought_for_name} (${purchaseDto.bought_for_mobile})`
      : `Successfully assigned ${purchaseDto.quantity} ${voucherType} voucher(s) for yourself`;

    return {
      success: true,
      assigned_vouchers: assignedVouchers,
      message,
    };
  }

  /**
   * Get voucher type from service name
   */
  private getVoucherTypeFromService(service?: string): string {
    if (!service) return 'BECE';
    
    const serviceToVoucherType = {
      'BECE Checker Voucher': 'BECE',
      'WASSCE / Nov/Dec Checker': 'WASSCE'
    };
    return serviceToVoucherType[service] || 'BECE';
  }

  async getAvailableVouchers(voucherType?: string): Promise<{ count: number; vouchers: VoucherResponseDto[] }> {
    const query: any = { 
      sold: false,
      mobile_number_assigned: { $exists: false }
    };

    if (voucherType) {
      if (voucherType === 'BECE') {
        // For BECE: include both vouchers with voucherType='BECE' AND vouchers without voucherType (legacy)
        query.$or = [
          { voucherType: 'BECE' },
          { voucherType: { $exists: false } }
        ];
      } else {
        // For other types: exact match required
        query.voucherType = voucherType;
      }
    }

    const vouchers = await this.voucherModel.find(query);

    return {
      count: vouchers.length,
      vouchers: vouchers.map(v => ({
        serial_number: v.serial_number,
        pin: v.pin,
        mobile_number_assigned: v.mobile_number_assigned,
        assigned_date: v.assigned_date,
        sold: v.sold,
      })),
    };
  }

  async getAssignedVouchers(mobileNumber: string): Promise<VoucherResponseDto[]> {
    const vouchers = await this.voucherModel.find({ 
      mobile_number_assigned: mobileNumber 
    });

    return vouchers.map(v => ({
      serial_number: v.serial_number,
      pin: v.pin,
      mobile_number_assigned: v.mobile_number_assigned,
      assigned_date: v.assigned_date,
      sold: v.sold,
    }));
  }

  async useVoucher(serialNumber: string): Promise<{ success: boolean; message: string }> {
    const voucher = await this.voucherModel.findOne({ serial_number: serialNumber });
    
    if (!voucher) {
      throw new NotFoundException('Voucher not found');
    }

    if (voucher.sold) {
      throw new BadRequestException('Voucher already sold');
    }

    if (!voucher.mobile_number_assigned) {
      throw new BadRequestException('Voucher not assigned to any mobile number');
    }

    voucher.sold = true;
    await voucher.save();

    return {
      success: true,
      message: `Voucher ${serialNumber} has been used successfully`,
    };
  }

  async getVoucherStats(): Promise<{
    total: number;
    available: number;
    assigned: number;
    sold: number;
  }> {
    const [total, available, assigned, sold] = await Promise.all([
      this.voucherModel.countDocuments(),
      this.voucherModel.countDocuments({ 
        sold: false, 
        mobile_number_assigned: { $exists: false } 
      }),
      this.voucherModel.countDocuments({ 
        mobile_number_assigned: { $exists: true },
        sold: false 
      }),
      this.voucherModel.countDocuments({ sold: true }),
    ]);

    return { total, available, assigned, sold };
  }

  async checkVoucherExists(serialNumber: string): Promise<boolean> {
    const normalizedSerialNumber = serialNumber.trim().toUpperCase();
    const existingVoucher = await this.voucherModel.findOne({ 
      serial_number: { $regex: new RegExp(`^${normalizedSerialNumber}$`, 'i') }
    });
    return !!existingVoucher;
  }

  async createVouchersBulk(serialNumbers: string[], pins: string[], voucherType: string = 'BECE'): Promise<{
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

    // Determine the maximum length to process
    const maxLength = Math.max(serialNumbers.length, pins.length);

    for (let i = 0; i < maxLength; i++) {
      const serialNumber = serialNumbers[i];
      const pin = pins[i];
      
      // Handle missing serial number or PIN
      if (!serialNumber) {
        results.errors.push(`Serial number is missing for voucher ${i + 1}`);
        results.failed++;
        continue;
      }

      if (!pin) {
        results.errors.push(`PIN is missing for voucher ${i + 1}`);
        results.failed++;
        continue;
      }
      
      const normalizedSerialNumber = serialNumber.trim().toUpperCase();
      const normalizedPin = pin.trim();
      
      try {
        if (!normalizedSerialNumber) {
          results.errors.push(`Serial number is required for voucher ${i + 1}`);
          results.failed++;
          continue;
        }

        if (!normalizedPin) {
          results.errors.push(`PIN is required for voucher ${i + 1}`);
          results.failed++;
          continue;
        }

        // Check if voucher already exists
        const exists = await this.checkVoucherExists(normalizedSerialNumber);
        if (exists) {
          results.duplicates.push(normalizedSerialNumber);
          results.failed++;
          continue;
        }

        // Create voucher
        const voucher = new this.voucherModel({
          serial_number: normalizedSerialNumber,
          pin: normalizedPin,
          date: new Date(),
          sold: false,
          voucherType: voucherType,
        });
        
        await voucher.save();
        results.success++;
        
      } catch (error) {
        if (error.code === 11000) {
          // MongoDB duplicate key error
          results.duplicates.push(normalizedSerialNumber);
        } else {
          results.errors.push(`Failed to create voucher ${normalizedSerialNumber}: ${error.message}`);
        }
        results.failed++;
      }
    }

    return results;
  }

  async markVoucherAsSold(serialNumber: string): Promise<{ success: boolean; message: string }> {
    const voucher = await this.voucherModel.findOne({ serial_number: serialNumber });
    
    if (!voucher) {
      throw new NotFoundException('Voucher not found');
    }

    if (voucher.sold) {
      throw new BadRequestException('Voucher already sold');
    }

    voucher.sold = true;
    await voucher.save();

    return {
      success: true,
      message: `Voucher ${serialNumber} has been marked as sold`,
    };
  }

  async getVoucherBySerialNumber(serialNumber: string): Promise<VoucherResponseDto | null> {
    const voucher = await this.voucherModel.findOne({ 
      serial_number: { $regex: new RegExp(`^${serialNumber}$`, 'i') }
    });

    if (!voucher) {
      return null;
    }

    return {
      serial_number: voucher.serial_number,
      pin: voucher.pin,
      mobile_number_assigned: voucher.mobile_number_assigned,
      assigned_date: voucher.assigned_date,
      sold: voucher.sold,
    };
  }

  async getVoucherByPin(pin: string): Promise<VoucherResponseDto | null> {
    const voucher = await this.voucherModel.findOne({ pin: pin });

    if (!voucher) {
      return null;
    }

    return {
      serial_number: voucher.serial_number,
      pin: voucher.pin,
      mobile_number_assigned: voucher.mobile_number_assigned,
      assigned_date: voucher.assigned_date,
      sold: voucher.sold,
    };
  }
}
