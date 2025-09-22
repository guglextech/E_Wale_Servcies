import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios, { AxiosResponse } from 'axios';
import { 
  AirtimeTopUpDto, 
  NetworkProvider, 
  HubtelAirtimeResponseDto,
  AirtimeCallbackDto 
} from '../models/dto/airtime.dto';
import { Transactions } from '../models/schemas/transaction.schema';

// Types for better type safety
interface HubtelEndpoints {
  [NetworkProvider.MTN]: {
    airtime: string;
    data: string;
    voice: string;
  };
  [NetworkProvider.TELECEL]: {
    airtime: string;
    data: string;
    voice: string;
  };
  [NetworkProvider.AT]: {
    airtime: string;
    data: string;
    voice: string;
  };
}

interface AirtimeDeliveryPayload {
  Destination: string;
  Amount: number;
  CallbackUrl: string;
  ClientReference: string;
}

interface TransactionLogData {
  type: 'airtime_delivery';
  network: NetworkProvider;
  destination: string;
  amount: number;
  clientReference: string;
  response?: any;
  status: 'pending' | 'completed' | 'failed';
}

@Injectable()
export class AirtimeService {
  private readonly logger = new Logger(AirtimeService.name);

  // Hubtel Commission Service endpoints for different networks
  private readonly hubtelEndpoints: HubtelEndpoints = {
    [NetworkProvider.MTN]: {
      airtime: 'fdd76c884e614b1c8f669a3207b09a98',
      data: 'fdd76c884e614b1c8f669a3207b09a98', 
      voice: 'fdd76c884e614b1c8f669a3207b09a98' 
    },
    [NetworkProvider.TELECEL]: {
      airtime: 'f4be83ad74c742e185224fdae1304800',
      data: 'f4be83ad74c742e185224fdae1304800', 
      voice: 'f4be83ad74c742e185224fdae1304800' 
    },
    [NetworkProvider.AT]: {
      airtime: 'dae2142eb5a14c298eace60240c09e4b',
      data: 'dae2142eb5a14c298eace60240c09e4b', 
      voice: 'dae2142eb5a14c298eace60240c09e4b' 
    }
  };

  constructor(
    @InjectModel(Transactions.name) private readonly transactionModel: Model<Transactions>,
  ) {}


  /**
   * Deliver airtime via Hubtel Commission Service
   * This is called after payment is successful
   */
  async deliverAirtime(airtimeDto: AirtimeTopUpDto): Promise<HubtelAirtimeResponseDto> {
    try {
      this.validateAirtimeRequest(airtimeDto);
      const destination = this.formatMobileNumber(airtimeDto.destination);
      
      this.logger.log(`Delivering airtime - Network: ${airtimeDto.network}, Destination: ${destination}, Amount: ${airtimeDto.amount}`);

      const endpoint = this.hubtelEndpoints[airtimeDto.network].airtime;
      const hubtelPrepaidDepositID = this.getRequiredEnvVar('HUBTEL_PREPAID_DEPOSIT_ID');

      const requestPayload: AirtimeDeliveryPayload = {
        Destination: destination,
        Amount: airtimeDto.amount,
        CallbackUrl: this.getRequiredEnvVar('HB_CALLBACK_URL'),
        ClientReference: `AIRTIME_${airtimeDto.clientReference}_${Date.now()}`
      };

      const url = `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}`;
      this.logger.log(`Delivering airtime via: ${url}`);

      const response = await this.callCommissionService(url, requestPayload);
      
      await this.logTransaction({
        type: 'airtime_delivery',
        network: airtimeDto.network,
        destination,
        amount: airtimeDto.amount,
        clientReference: requestPayload.ClientReference,
        response: response.data,
        status: 'completed'
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error delivering airtime: ${error.message}`);
      this.logHubtelError(error);
      throw error;
    }
  }

  /**
   * Handle airtime delivery callback from Hubtel Commission Service
   */
  async handleAirtimeCallback(callbackData: AirtimeCallbackDto): Promise<void> {
    try {
      await this.transactionModel.findOneAndUpdate(
        { clientReference: callbackData.ClientReference },
        {
          $set: {
            status: callbackData.ResponseCode === '0000' ? 'success' : 'failed',
            transactionId: callbackData.TransactionId,
            finalAmount: callbackData.Amount,
            commission: callbackData.Commission,
            callbackReceived: true,
            callbackDate: new Date()
          }
        }
      );

      this.logger.log(`Airtime callback processed for ${callbackData.ClientReference}`);
    } catch (error) {
      this.logger.error(`Error processing airtime callback: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate airtime request parameters
   */
  private validateAirtimeRequest(airtimeDto: AirtimeTopUpDto): void {
    if (airtimeDto.amount > 100) {
      throw new BadRequestException('Maximum airtime top-up amount is 100 cedis');
    }

    const decimalPlaces = (airtimeDto.amount.toString().split('.')[1] || '').length;
    if (decimalPlaces > 2) {
      throw new BadRequestException('Enter valid amount (e.g., 10.50)');
    }

    if (!airtimeDto.destination || airtimeDto.destination.trim().length === 0) {
      throw new BadRequestException('Destination mobile number is required');
    }
  }

  /**
   * Format mobile number to international format
   */
  private formatMobileNumber(destination: string): string {
    if (!destination.startsWith('233')) {
      if (destination.startsWith('0')) {
        return '233' + destination.substring(1);
      } else if (destination.length === 9) {
        return '233' + destination;
      }
    }
    return destination;
  }

  /**
   * Call Hubtel Commission Service
   */
  private async callCommissionService(url: string, payload: AirtimeDeliveryPayload): Promise<AxiosResponse> {
    return await axios.post(
      url,
      payload,
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Basic ${this.getRequiredEnvVar('HUBTEL_AUTH_TOKEN')}`
        }
      }
    );
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
          network: transactionData.network,
          response: transactionData.response
        },
        CustomerMobileNumber: transactionData.destination || 'N/A',
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
