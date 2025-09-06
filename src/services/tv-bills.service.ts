import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios, { AxiosResponse } from 'axios';
import { 
  TVAccountQueryDto, 
  TVBillPaymentDto, 
  TVBillPaymentRequestDto,
  TVProvider,
  TVAccountInfo
} from '../models/dto/tv-bills.dto';
import { Transactions } from '../models/schemas/transaction.schema';

// Types for better type safety
interface HubtelEndpoints {
  [TVProvider.DSTV]: string;
  [TVProvider.GOTV]: string;
  [TVProvider.STARTIMES]: string;
}

interface TVBillPaymentPayload {
  Destination: string;
  Amount: number;
  CallbackUrl: string;
  ClientReference: string;
}

interface TransactionLogData {
  type: 'tv_bill_payment_processed';
  provider: TVProvider;
  accountNumber: string;
  amount: number;
  clientReference: string;
  response?: any;
  status: 'pending' | 'completed' | 'failed';
}

@Injectable()
export class TVBillsService {
  private readonly logger = new Logger(TVBillsService.name);

  // Hubtel Commission Service endpoints for different TV providers
  private readonly hubtelEndpoints: HubtelEndpoints = {
    [TVProvider.DSTV]: '297a96656b5846ad8b00d5d41b256ea7',
    [TVProvider.GOTV]: 'e6ceac7f3880435cb30b048e9617eb41',
    [TVProvider.STARTIMES]: '6598652d34ea4112949c93c079c501ce'
  };

  constructor(
    @InjectModel(Transactions.name) private readonly transactionModel: Model<Transactions>,
  ) {}

  // ==================== PUBLIC METHODS ====================

  /**
   * Pay TV bill via Hubtel Commission Service
   * This is called after payment is successful
   */
  async payTVBill(tvBillDto: TVBillPaymentDto): Promise<any> {
    try {
      this.validateTVBillRequest(tvBillDto);
      
      this.logger.log(`Processing TV bill payment - Provider: ${tvBillDto.provider}, Account: ${tvBillDto.accountNumber}, Amount: ${tvBillDto.amount}`);

      const endpoint = this.hubtelEndpoints[tvBillDto.provider];
      const hubtelPrepaidDepositID = this.getRequiredEnvVar('HUBTEL_PREPAID_DEPOSIT_ID');

      const requestPayload: TVBillPaymentPayload = {
        Destination: tvBillDto.accountNumber,
        Amount: tvBillDto.amount,
        CallbackUrl: tvBillDto.callbackUrl || this.getRequiredEnvVar('HB_CALLBACK_URL'),
        ClientReference: `TVBILL_${tvBillDto.clientReference}_${Date.now()}`
      };

      const url = `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}`;
      this.logger.log(`Processing TV bill payment via: ${url}`);

      const response = await this.callCommissionService(url, requestPayload);

      await this.logTransaction({
        type: 'tv_bill_payment_processed',
        provider: tvBillDto.provider,
        accountNumber: tvBillDto.accountNumber,
        amount: tvBillDto.amount,
        clientReference: requestPayload.ClientReference,
        response: response.data,
        status: 'completed'
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error processing TV bill payment: ${error.message}`);
      this.logHubtelError(error);
      throw error;
    }
  }

  /**
   * Query TV account information
   */
  async queryAccount(queryDto: TVAccountQueryDto): Promise<TVAccountInfo> {
    try {
      const { provider, accountNumber } = queryDto;
      
      this.logger.log(`Querying TV account - Provider: ${provider}, Account: ${accountNumber}`);

      const endpoint = this.hubtelEndpoints[provider];
      const hubtelPrepaidDepositID = this.getRequiredEnvVar('HUBTEL_PREPAID_DEPOSIT_ID');

      const url = `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}?destination=${accountNumber}`;

      const response = await axios.get(url, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Basic ${this.getRequiredEnvVar('HUBTEL_AUTH_TOKEN')}`
        }
      });

      this.logger.log(`TV account query response: ${JSON.stringify(response.data)}`);

      return response.data;
    } catch (error) {
      this.logger.error(`Error querying TV account: ${error.message}`);
      this.logHubtelError(error);
      throw error;
    }
  }

  /**
   * Handle TV bill payment callback from Hubtel Commission Service
   */
  async handleTVBillCallback(callbackData: any): Promise<void> {
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

      this.logger.log(`TV bill callback processed for ${ClientReference}`);
    } catch (error) {
      this.logger.error(`Error processing TV bill callback: ${error.message}`);
      throw error;
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Validate TV bill request parameters
   */
  private validateTVBillRequest(tvBillDto: TVBillPaymentDto): void {
    if (tvBillDto.amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const decimalPlaces = (tvBillDto.amount.toString().split('.')[1] || '').length;
    if (decimalPlaces > 2) {
      throw new BadRequestException('Enter valid amount (e.g., 10.50)');
    }

    if (!tvBillDto.accountNumber || tvBillDto.accountNumber.trim().length === 0) {
      throw new BadRequestException('Account number is required');
    }

    if (!tvBillDto.provider) {
      throw new BadRequestException('TV provider is required');
    }
  }

  /**
   * Call Hubtel Commission Service
   */
  private async callCommissionService(url: string, payload: TVBillPaymentPayload): Promise<AxiosResponse> {
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
          provider: transactionData.provider,
          accountNumber: transactionData.accountNumber,
          response: transactionData.response
        },
        CustomerMobileNumber: 'N/A',
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
