import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios, { AxiosResponse } from 'axios';
import { 
  ECGMeterQueryDto, 
  ECGTopUpDto, 
  ECGTopUpRequestDto,
  GhanaWaterQueryDto, 
  GhanaWaterTopUpDto, 
  GhanaWaterTopUpRequestDto,
  UtilityProvider,
  UtilityQueryResponse
} from '../models/dto/utility.dto';
import { Transactions } from '../models/schemas/transaction.schema';

// Types for better type safety
interface HubtelEndpoints {
  [UtilityProvider.ECG]: string;
  [UtilityProvider.GHANA_WATER]: string;
}

interface ECGTopUpPayload {
  Destination: string;
  Amount: number;
  CallbackUrl: string;
  ClientReference: string;
  Extradata: {
    bundle: string;
  };
}

interface GhanaWaterTopUpPayload {
  Destination: string;
  Amount: number;
  Extradata: {
    bundle: string;
    Email: string;
    SessionId: string;
  };
  CallbackUrl: string;
  ClientReference: string;
}

interface TransactionLogData {
  type: 'ecg_topup_processed' | 'ghana_water_topup_processed';
  mobileNumber?: string;
  meterNumber: string;
  amount: number;
  clientReference: string;
  response?: any;
  status: 'pending' | 'completed' | 'failed';
}

@Injectable()
export class UtilityService {
  private readonly logger = new Logger(UtilityService.name);

  constructor(
    @InjectModel(Transactions.name) private readonly transactionModel: Model<Transactions>,
  ) {}

  // Hubtel Commission Service endpoints for different utility providers
  private readonly hubtelEndpoints: HubtelEndpoints = {
    [UtilityProvider.ECG]: 'e6d6bac062b5499cb1ece1ac3d742a84',
    [UtilityProvider.GHANA_WATER]: '6c1e8a82d2e84feeb8bfd6be2790d71d'
  };

  // ==================== PUBLIC METHODS ====================

  /**
   * Top up ECG meter via Hubtel Commission Service
   * This is called after payment is successful
   */
  async topUpECG(ecgTopUpDto: ECGTopUpDto): Promise<any> {
    try {
      this.validateECGTopUpRequest(ecgTopUpDto);
      const mobileNumber = this.formatMobileNumber(ecgTopUpDto.mobileNumber);
      
      this.logger.log(`Processing ECG top-up - Mobile: ${mobileNumber}, Meter: ${ecgTopUpDto.meterNumber}, Amount: ${ecgTopUpDto.amount}`);

      const endpoint = this.hubtelEndpoints[UtilityProvider.ECG];
      const hubtelPrepaidDepositID = this.getRequiredEnvVar('HUBTEL_PREPAID_DEPOSIT_ID');

      const requestPayload: ECGTopUpPayload = {
        Destination: mobileNumber,
        Amount: ecgTopUpDto.amount,
        CallbackUrl: ecgTopUpDto.callbackUrl || this.getRequiredEnvVar('HB_CALLBACK_URL'),
        ClientReference: `ECG_${ecgTopUpDto.clientReference}_${Date.now()}`,
        Extradata: {
          bundle: ecgTopUpDto.meterNumber
        }
      };

      const url = `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}`;
      this.logger.log(`Processing ECG top-up via: ${url}`);

      const response = await this.callCommissionService(url, requestPayload);
      
      await this.logTransaction({
        type: 'ecg_topup_processed',
        mobileNumber,
        meterNumber: ecgTopUpDto.meterNumber,
        amount: ecgTopUpDto.amount,
        clientReference: requestPayload.ClientReference,
        response: response.data,
        status: 'completed'
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error processing ECG top-up: ${error.message}`);
      this.logHubtelError(error);
      throw error;
    }
  }

  /**
   * Top up Ghana Water meter via Hubtel Commission Service
   * This is called after payment is successful
   */
  async topUpGhanaWater(ghanaWaterTopUpDto: GhanaWaterTopUpDto): Promise<any> {
    try {
      this.validateGhanaWaterTopUpRequest(ghanaWaterTopUpDto);

      this.logger.log(`Processing Ghana Water top-up - Meter: ${ghanaWaterTopUpDto.meterNumber}, Amount: ${ghanaWaterTopUpDto.amount}`);

      const endpoint = this.hubtelEndpoints[UtilityProvider.GHANA_WATER];
      const hubtelPrepaidDepositID = this.getRequiredEnvVar('HUBTEL_PREPAID_DEPOSIT_ID');

      const requestPayload: GhanaWaterTopUpPayload = {
        Destination: ghanaWaterTopUpDto.meterNumber,
        Amount: ghanaWaterTopUpDto.amount,
        Extradata: {
          bundle: ghanaWaterTopUpDto.meterNumber,
          Email: ghanaWaterTopUpDto.email,
          SessionId: ghanaWaterTopUpDto.sessionId
        },
        CallbackUrl: ghanaWaterTopUpDto.callbackUrl || this.getRequiredEnvVar('HB_CALLBACK_URL'),
        ClientReference: `GHANAWATER_${ghanaWaterTopUpDto.clientReference}_${Date.now()}`
      };

      const url = `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}`;
      this.logger.log(`Processing Ghana Water top-up via: ${url}`);

      const response = await this.callCommissionService(url, requestPayload);
      
      await this.logTransaction({
        type: 'ghana_water_topup_processed',
        meterNumber: ghanaWaterTopUpDto.meterNumber,
        amount: ghanaWaterTopUpDto.amount,
        clientReference: requestPayload.ClientReference,
        response: response.data,
        status: 'completed'
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error processing Ghana Water top-up: ${error.message}`);
      this.logHubtelError(error);
      throw error;
    }
  }

  /**
   * Query ECG meter information
   */
  async queryECGMeters(queryDto: ECGMeterQueryDto): Promise<UtilityQueryResponse> {
    try {
      const { mobileNumber } = queryDto;
      
      this.logger.log(`Querying ECG meter - Mobile: ${mobileNumber}`);

      const endpoint = this.hubtelEndpoints[UtilityProvider.ECG];
      const hubtelPrepaidDepositID = this.getRequiredEnvVar('HUBTEL_PREPAID_DEPOSIT_ID');

      const url = `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}?destination=${mobileNumber}`;

      const response = await axios.get(url, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Basic ${this.getRequiredEnvVar('HUBTEL_AUTH_TOKEN')}`
        }
      });

      this.logger.log(`ECG meter query response: ${JSON.stringify(response.data)}`);

      return response.data;
    } catch (error) {
      this.logger.error(`Error querying ECG meter: ${error.message}`);
      this.logHubtelError(error);
      throw error;
    }
  }

  /**
   * Query Ghana Water account information
   */
  async queryGhanaWaterAccount(queryDto: GhanaWaterQueryDto): Promise<UtilityQueryResponse> {
    try {
      const { meterNumber, mobileNumber } = queryDto;
      
      // Validate meter number
      if (!meterNumber || meterNumber.trim().length === 0) {
        throw new BadRequestException('Meter number is required');
      }
      
      // Clean meter number (remove spaces and special characters)
      const cleanedMeterNumber = meterNumber.replace(/\s/g, '').trim();
      
      // Format mobile number to international format
      const formattedMobileNumber = this.formatMobileNumber(mobileNumber);
      
      this.logger.log(`Querying Ghana Water account - Meter: ${cleanedMeterNumber}, Mobile: ${formattedMobileNumber}`);

      const endpoint = this.hubtelEndpoints[UtilityProvider.GHANA_WATER];
      const hubtelPrepaidDepositID = this.getRequiredEnvVar('HUBTEL_PREPAID_DEPOSIT_ID');

      const url = `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}?destination=${encodeURIComponent(cleanedMeterNumber)}&mobile=${encodeURIComponent(formattedMobileNumber)}`;

      this.logger.log(`Ghana Water query URL: ${url}`);

      const response = await axios.get(url, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          'Authorization': `Basic ${this.getRequiredEnvVar('HUBTEL_AUTH_TOKEN')}`
        }
      });

      this.logger.log(`Ghana Water account query response: ${JSON.stringify(response.data)}`);

      // Check if the response indicates an error
      if (response.data.ResponseCode !== '0000') {
        this.logger.error(`Ghana Water query failed - ResponseCode: ${response.data.ResponseCode}, Message: ${response.data.Message}`);
        throw new BadRequestException(`Ghana Water query failed: ${response.data.Message}`);
      }

      return response.data;
    } catch (error) {
      this.logger.error(`Error querying Ghana Water account: ${error.message}`);
      this.logHubtelError(error);
      throw error;
    }
  }

  /**
   * Handle utility payment callback from Hubtel Commission Service
   */
  async handleUtilityCallback(callbackData: any): Promise<void> {
    try {
      const { ClientReference, ResponseCode, Data } = callbackData;
      const TransactionId = Data?.TransactionId;
      const Commission = Data?.Meta?.Commission;
      const Amount = Data?.Amount;

      await this.transactionModel.findOneAndUpdate(
        { clientReference: ClientReference },
        {
          $set: {
            status: ResponseCode === '0000' ? 'success' : 'failed',
            transactionId: TransactionId,
            finalAmount: Amount,
            commission: Commission,
            callbackReceived: true,
            callbackDate: new Date()
          }
        }
      );

      this.logger.log(`Utility callback processed for ${ClientReference}`);
    } catch (error) {
      this.logger.error(`Error processing utility callback: ${error.message}`);
      throw error;
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Validate ECG top-up request parameters
   */
  private validateECGTopUpRequest(ecgTopUpDto: ECGTopUpDto): void {
    if (ecgTopUpDto.amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const decimalPlaces = (ecgTopUpDto.amount.toString().split('.')[1] || '').length;
    if (decimalPlaces > 2) {
      throw new BadRequestException('Enter valid amount (e.g., 10.50)');
    }

    if (!ecgTopUpDto.meterNumber || ecgTopUpDto.meterNumber.trim().length === 0) {
      throw new BadRequestException('Meter number is required');
    }

    if (!ecgTopUpDto.mobileNumber || ecgTopUpDto.mobileNumber.trim().length === 0) {
      throw new BadRequestException('Mobile number is required');
    }
  }

  /**
   * Validate Ghana Water top-up request parameters
   */
  private validateGhanaWaterTopUpRequest(ghanaWaterTopUpDto: GhanaWaterTopUpDto): void {
    if (ghanaWaterTopUpDto.amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const decimalPlaces = (ghanaWaterTopUpDto.amount.toString().split('.')[1] || '').length;
    if (decimalPlaces > 2) {
      throw new BadRequestException('Enter valid amount (e.g., 10.50)');
    }

    if (!ghanaWaterTopUpDto.meterNumber || ghanaWaterTopUpDto.meterNumber.trim().length === 0) {
      throw new BadRequestException('Meter number is required');
    }
  }

  /**
   * Format mobile number to international format
   */
  private formatMobileNumber(mobileNumber: string): string {
    if (!mobileNumber.startsWith('233')) {
      if (mobileNumber.startsWith('0')) {
        return '233' + mobileNumber.substring(1);
      } else if (mobileNumber.length === 9) {
        return '233' + mobileNumber;
      }
    }
    return mobileNumber;
  }

  /**
   * Call Hubtel Commission Service
   */
  private async callCommissionService(url: string, payload: any): Promise<AxiosResponse> {
    return await axios.post(url, payload, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${this.getRequiredEnvVar('HUBTEL_AUTH_TOKEN')}`
      }
    });
  }

  /**
   * Get required environment variable or throw error
   */
  private getRequiredEnvVar(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new InternalServerErrorException(`${key} environment variable is required`);
    }
    return value;
  }

  /**
   * Log Hubtel API errors
   */
  private logHubtelError(error: any): void {
    if (error.response) {
      this.logger.error(`Hubtel response status: ${error.response.status}`);
      this.logger.error(`Hubtel response data: ${JSON.stringify(error.response.data)}`);
    }
  }

  /**
   * Log transaction to database
   */
  private async logTransaction(transactionData: TransactionLogData): Promise<void> {
    try {
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      
      const transaction = new this.transactionModel({
        SessionId: transactionData.clientReference || `session_${timestamp}_${randomSuffix}`,
        OrderId: transactionData.clientReference || `order_${timestamp}_${randomSuffix}`,
        ExtraData: {
          type: transactionData.type,
          meterNumber: transactionData.meterNumber,
          mobileNumber: transactionData.mobileNumber,
          response: transactionData.response
        },
        CustomerMobileNumber: transactionData.mobileNumber || 'N/A',
        Status: transactionData.status || (transactionData.response?.ResponseCode === '0000' ? 'success' : 'pending'),
        OrderDate: new Date(),
        Currency: 'GHS',
        Subtotal: transactionData.amount || 0,
        PaymentType: 'mobile_money',
        AmountPaid: transactionData.amount || 0,
        PaymentDate: new Date(),
        IsSuccessful: transactionData.status === 'completed' || transactionData.response?.ResponseCode === '0000' || false,
        createdAt: new Date()
      });
      
      await transaction.save();
    } catch (error) {
      this.logger.error(`Error logging transaction: ${error.message}`);
    }
  }
}
