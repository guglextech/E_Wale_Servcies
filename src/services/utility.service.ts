import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { 
  ECGMeterQueryDto, 
  GhanaWaterQueryDto,
  ECGTopUpDto, 
  GhanaWaterTopUpDto,
  ECGTopUpRequestDto,
  GhanaWaterTopUpRequestDto,
  UtilityProvider,
  UtilityQueryResponse,
  UtilityMeterInfo
} from '../models/dto/utility.dto';
import { Transactions } from '../models/schemas/transaction.schema';

@Injectable()
export class UtilityService {
  private readonly logger = new Logger(UtilityService.name);

  constructor(
    @InjectModel(Transactions.name) private readonly transactionModel: Model<Transactions>,
  ) {}

  // Hubtel API endpoints for different utility providers
  private readonly hubtelEndpoints = {
    [UtilityProvider.ECG]: 'e6d6bac062b5499cb1ece1ac3d742a84',
    [UtilityProvider.GHANA_WATER]: '6c1e8a82d2e84feeb8bfd6be2790d71d'
  };

  async queryECGMeters(ecgQueryDto: ECGMeterQueryDto): Promise<UtilityQueryResponse> {
    try {
      const endpoint = this.hubtelEndpoints[UtilityProvider.ECG];
      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID || '2023298';

      const response = await axios.get(
        `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}?destination=${ecgQueryDto.mobileNumber}`,
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Basic ${process.env.HUBTEL_AUTH_TOKEN}`
          }
        }
      );

      // Log the query
      await this.logTransaction({
        type: 'ecg_meter_query',
        mobileNumber: ecgQueryDto.mobileNumber,
        response: response.data
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error querying ECG meters: ${error.message}`);
      throw error;
    }
  }

  async queryGhanaWaterAccount(ghanaWaterQueryDto: GhanaWaterQueryDto): Promise<UtilityQueryResponse> {
    try {
      const endpoint = this.hubtelEndpoints[UtilityProvider.GHANA_WATER];
      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID || '2023298';

      const response = await axios.get(
        `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}?destination=${ghanaWaterQueryDto.meterNumber}&mobile=${ghanaWaterQueryDto.mobileNumber}`,
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Basic ${process.env.HUBTEL_AUTH_TOKEN}`
          }
        }
      );

      // Log the query
      await this.logTransaction({
        type: 'ghana_water_query',
        meterNumber: ghanaWaterQueryDto.meterNumber,
        mobileNumber: ghanaWaterQueryDto.mobileNumber,
        response: response.data
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error querying Ghana Water account: ${error.message}`);
      throw error;
    }
  }

  async topUpECG(ecgTopUpDto: ECGTopUpDto): Promise<any> {
    try {
      const endpoint = this.hubtelEndpoints[UtilityProvider.ECG];
      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID || '2023298';

      const requestPayload: ECGTopUpRequestDto = {
        Destination: ecgTopUpDto.mobileNumber,
        Amount: ecgTopUpDto.amount,
        CallbackUrl: ecgTopUpDto.callbackUrl,
        ClientReference: ecgTopUpDto.clientReference,
        Extradata: {
          bundle: ecgTopUpDto.meterNumber
        }
      };

      const response = await axios.post(
        `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}`,
        requestPayload,
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Basic ${process.env.HUBTEL_AUTH_TOKEN}`
          }
        }
      );

      // Log the transaction
      await this.logTransaction({
        type: 'ecg_topup',
        mobileNumber: ecgTopUpDto.mobileNumber,
        meterNumber: ecgTopUpDto.meterNumber,
        amount: ecgTopUpDto.amount,
        clientReference: ecgTopUpDto.clientReference,
        response: response.data
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error topping up ECG meter: ${error.message}`);
      throw error;
    }
  }

  async topUpGhanaWater(ghanaWaterTopUpDto: GhanaWaterTopUpDto): Promise<any> {
    try {
      const endpoint = this.hubtelEndpoints[UtilityProvider.GHANA_WATER];
      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID || '2023298';

      const requestPayload: GhanaWaterTopUpRequestDto = {
        Destination: ghanaWaterTopUpDto.meterNumber,
        Amount: ghanaWaterTopUpDto.amount,
        Extradata: {
          bundle: ghanaWaterTopUpDto.meterNumber,
          Email: ghanaWaterTopUpDto.email,
          SessionId: ghanaWaterTopUpDto.sessionId
        },
        CallbackUrl: ghanaWaterTopUpDto.callbackUrl,
        ClientReference: ghanaWaterTopUpDto.clientReference
      };

      const response = await axios.post(
        `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}`,
        requestPayload,
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Basic ${process.env.HUBTEL_AUTH_TOKEN}`
          }
        }
      );

      // Log the transaction
      await this.logTransaction({
        type: 'ghana_water_topup',
        meterNumber: ghanaWaterTopUpDto.meterNumber,
        email: ghanaWaterTopUpDto.email,
        sessionId: ghanaWaterTopUpDto.sessionId,
        amount: ghanaWaterTopUpDto.amount,
        clientReference: ghanaWaterTopUpDto.clientReference,
        response: response.data
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error topping up Ghana Water: ${error.message}`);
      throw error;
    }
  }

  async handleUtilityCallback(callbackData: any): Promise<void> {
    try {
      // Update transaction status based on callback
      await this.transactionModel.findOneAndUpdate(
        { clientReference: callbackData.ClientReference },
        {
          $set: {
            status: callbackData.ResponseCode === '0000' ? 'success' : 'failed',
            transactionId: callbackData.TransactionId,
            finalAmount: callbackData.Amount,
            commission: callbackData.Meta?.Commission,
            callbackReceived: true,
            callbackDate: new Date()
          }
        }
      );

      this.logger.log(`Utility callback processed for ${callbackData.ClientReference}`);
    } catch (error) {
      this.logger.error(`Error processing utility callback: ${error.message}`);
      throw error;
    }
  }

  // Helper method to format ECG meter info for USSD display
  formatECGMeterInfo(meterData: UtilityMeterInfo[]): string {
    if (!meterData || meterData.length === 0) {
      return "No meters found for this mobile number.";
    }

    const meterOptions = meterData.map((meter, index) => {
      const display = meter.Display.trim();
      const amount = meter.Amount;
      const status = amount < 0 ? "Credit" : amount > 0 ? "Debt" : "No Balance";
      return `${index + 1}. ${display} (${status}: GHS ${Math.abs(amount).toFixed(2)})`;
    }).join('\n');

    return `Available Meters:\n${meterOptions}`;
  }

  // Helper method to format Ghana Water account info for USSD display
  formatGhanaWaterInfo(accountData: UtilityMeterInfo[]): string {
    const accountInfo = accountData.reduce((acc, item) => {
      acc[item.Display.toLowerCase()] = item.Value;
      return acc;
    }, {} as any);

    let display = '';
    
    if (accountInfo.name) {
      display += `Name: ${accountInfo.name}\n`;
    }
    if (accountInfo.amountdue) {
      display += `Amount Due: GHS ${accountInfo.amountdue}\n`;
    }
    if (accountInfo.sessionid) {
      display += `Session ID: ${accountInfo.sessionid}\n`;
    }

    return display.trim();
  }

  // Helper method to validate mobile number format
  validateMobileNumber(mobileNumber: string): boolean {
    // Ghana mobile number validation (10-11 digits starting with 233)
    return /^233\d{9}$/.test(mobileNumber);
  }

  // Helper method to convert local Ghana number to international format
  convertToInternationalFormat(mobileNumber: string): string {
    // Remove any spaces, dashes, or other characters
    const cleanNumber = mobileNumber.replace(/[\s\-\(\)]/g, '');
    
    // If it's already in international format (starts with 233), return as is
    if (cleanNumber.startsWith('233')) {
      return cleanNumber;
    }
    
    // If it starts with 0, replace with 233
    if (cleanNumber.startsWith('0')) {
      return '233' + cleanNumber.substring(1);
    }
    
    // If it's a 9-digit number (without country code), add 233
    if (cleanNumber.length === 9) {
      return '233' + cleanNumber;
    }
    
    // If it's a 10-digit number starting with 0, replace 0 with 233
    if (cleanNumber.length === 10 && cleanNumber.startsWith('0')) {
      return '233' + cleanNumber.substring(1);
    }
    
    // Return as is if no conversion needed
    return cleanNumber;
  }

  // Helper method to validate and convert mobile number
  validateAndConvertMobileNumber(mobileNumber: string): { isValid: boolean; convertedNumber?: string; error?: string } {
    const convertedNumber = this.convertToInternationalFormat(mobileNumber);
    
    // Check if the converted number is valid
    if (this.validateMobileNumber(convertedNumber)) {
      return { isValid: true, convertedNumber };
    }
    
    // Provide specific error messages
    if (mobileNumber.length < 9) {
      return { isValid: false, error: 'Mobile number too short' };
    }
    
    if (mobileNumber.length > 11) {
      return { isValid: false, error: 'Mobile number too long' };
    }
    
    return { isValid: false, error: 'Invalid mobile number format' };
  }

  // Helper method to validate ECG meter number format
  validateECGMeterNumber(meterNumber: string): boolean {
    // ECG meter numbers can vary in format
    return /^[A-Z0-9]{8,12}$/.test(meterNumber.trim());
  }

  // Helper method to validate Ghana Water meter number format
  validateGhanaWaterMeterNumber(meterNumber: string): boolean {
    // Ghana Water meter numbers are typically 12 digits
    return /^\d{12}$/.test(meterNumber.trim());
  }

  // Helper method to validate email format
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private async logTransaction(transactionData: any): Promise<void> {
    try {
      const transaction = new this.transactionModel({
        ...transactionData,
        createdAt: new Date()
      });
      await transaction.save();
    } catch (error) {
      this.logger.error(`Error logging transaction: ${error.message}`);
    }
  }
}
