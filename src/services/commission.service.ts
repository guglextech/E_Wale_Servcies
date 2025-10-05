import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { Transactions } from '../models/schemas/transaction.schema';
import { NetworkProvider } from '../models/dto/airtime.dto';
import { TVProvider } from '../models/dto/tv-bills.dto';
import { UtilityProvider } from '../models/dto/utility.dto';
import { UserCommissionService } from './user-commission.service';

export interface CommissionServiceRequest {
  serviceType: 'airtime' | 'bundle' | 'tv_bill' | 'utility';
  network?: NetworkProvider;
  tvProvider?: TVProvider;
  utilityProvider?: UtilityProvider;
  destination: string;
  amount: number;
  clientReference: string;
  callbackUrl?: string;
  extraData?: any;
}

export interface CommissionServiceResponse {
  ResponseCode: string;
  Message: string;
  Data?: any;
  TransactionId?: string;
  Commission?: string;
}

@Injectable()
export class CommissionService {
  private readonly logger = new Logger(CommissionService.name);

  constructor(
    @InjectModel(Transactions.name) private readonly transactionModel: Model<Transactions>,
    private readonly userCommissionService: UserCommissionService,
  ) {}

  // Hubtel Commission Service endpoints
  private readonly commissionEndpoints = {
    // Airtime endpoints
    airtime: {
      [NetworkProvider.MTN]: 'fdd76c884e614b1c8f669a3207b09a98',
      [NetworkProvider.TELECEL]: 'f4be83ad74c742e185224fdae1304800',
      [NetworkProvider.AT]: 'dae2142eb5a14c298eace60240c09e4b'
    },
    // Bundle endpoints
    bundle: {
      [NetworkProvider.MTN]: 'b230733cd56b4a0fad820e39f66bc27c',
      [NetworkProvider.TELECEL]: 'fa27127ba039455da04a2ac8a1613e00',
      [NetworkProvider.AT]: '06abd92da459428496967612463575ca'
    },
    // TV Bill endpoints
    tv_bill: {
      [TVProvider.DSTV]: '297a96656b5846ad8b00d5d41b256ea7',
      [TVProvider.GOTV]: 'e6ceac7f3880435cb30b048e9617eb41',
      [TVProvider.STARTIMES]: '6598652d34ea4112949c93c079c501ce'
    },
    // Utility endpoints
    utility: {
      [UtilityProvider.ECG]: 'e6d6bac062b5499cb1ece1ac3d742a84',
      [UtilityProvider.GHANA_WATER]: '6c1e8a82d2e84feeb8bfd6be2790d71d'
    }
  };

  /**
   * Process commission service request
   * This is the main method that handles all commission service transactions
   */
  async processCommissionService(request: CommissionServiceRequest): Promise<CommissionServiceResponse> {
    try {
      this.logger.log(`Processing commission service - Type: ${request.serviceType}, Amount: ${request.amount}, Destination: ${request.destination}`);

      // Get the appropriate endpoint
      const endpoint = this.getEndpoint(request);
      if (!endpoint) {
        throw new Error(`No endpoint found for service type: ${request.serviceType}`);
      }

      // Get Hubtel Prepaid Deposit ID
      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID;
      if (!hubtelPrepaidDepositID) {
        throw new Error('HUBTEL_PREPAID_DEPOSIT_ID environment variable is required');
      }

      // Build request payload
      const requestPayload = this.buildRequestPayload(request);

      // Make the commission service request
      const url = `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}`;
      this.logger.log(`Making commission service request to: ${url}`);

      const response = await axios.post(url, requestPayload, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Basic ${process.env.HUBTEL_AUTH_TOKEN}`
        }
      });

      this.logger.log(`Commission service response: ${JSON.stringify(response.data)}`);

      // Log the transaction
      await this.logCommissionTransaction(request, response.data);

      return response.data;

    } catch (error) {
      this.logger.error(`Error processing commission service: ${error.message}`);
      if (error.response) {
        this.logger.error(`Hubtel response status: ${error.response.status}`);
        this.logger.error(`Hubtel response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Get the appropriate endpoint for the service type
   */
  private getEndpoint(request: CommissionServiceRequest): string {
    switch (request.serviceType) {
      case 'airtime':
        return this.commissionEndpoints.airtime[request.network];
      case 'bundle':
        return this.commissionEndpoints.bundle[request.network];
      case 'tv_bill':
        return this.commissionEndpoints.tv_bill[request.tvProvider];
      case 'utility':
        return this.commissionEndpoints.utility[request.utilityProvider];
      default:
        return null;
    }
  }

  /**
   * Build the request payload for the commission service
   */
  private buildRequestPayload(request: CommissionServiceRequest): any {
    const basePayload = {
      Destination: request.destination,
      Amount: request.amount,
      CallbackUrl: request.callbackUrl || `${process.env.HB_CALLBACK_URL}`,
      ClientReference: request.clientReference
    };

    // Add service-specific data
    switch (request.serviceType) {
      case 'airtime':
        return {
          ...basePayload,
          Extradata: {
            network: request.network,
            ...request.extraData
          }
        };

      case 'bundle':
        return {
          ...basePayload,
          Extradata: {
            bundle: request.extraData?.bundleValue
          }
        };

      case 'tv_bill':
        return basePayload;

      case 'utility':
        if (request.utilityProvider === UtilityProvider.ECG) {
          return {
            ...basePayload,
            Extradata: {
              bundle: request.extraData?.meterNumber,
              ...request.extraData
            }
          };
        } else if (request.utilityProvider === UtilityProvider.GHANA_WATER) {
          return {
            ...basePayload,
            Extradata: {
              bundle: request.extraData?.meterNumber, 
              Email: request.extraData?.email,
              SessionId: request.extraData?.sessionId
            }
          };
        }
        return basePayload;

      default:
        return basePayload;
    }
  }

  /**
   * Handle commission service callback
   * This processes the callback from Hubtel commission services
   */
  async handleCommissionCallback(callbackData: any): Promise<void> {
    try {
      this.logger.log(`Processing commission callback: ${JSON.stringify(callbackData)}`);

      const { ClientReference, ResponseCode, Message, Data } = callbackData;
      const TransactionId = Data?.TransactionId;
      const Commission = Data?.Meta?.Commission;

      // Update transaction status using OrderId (which contains the clientReference)
      await this.transactionModel.findOneAndUpdate(
        { OrderId: ClientReference },
        {
          $set: {
            Status: ResponseCode === '0000' ? 'success' : 'failed',
            transactionId: TransactionId,
            finalAmount: Data?.Amount,
            commission: Commission,
            callbackReceived: true,
            callbackDate: new Date(),
            responseCode: ResponseCode,
            responseMessage: Message,
            IsSuccessful: ResponseCode === '0000'
          }
        }
      );

      // Process commission for user earnings if successful
      if (ResponseCode === '0000') {
        await this.userCommissionService.processCommissionCallback(callbackData);
      }

      this.logger.log(`Commission callback processed for ${ClientReference} - Status: ${ResponseCode}`);

    } catch (error) {
      this.logger.error(`Error processing commission callback: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check commission service status
   * This checks the status of a commission service transaction
   */
  async checkCommissionStatus(clientReference: string): Promise<any> {
    try {
      this.logger.log(`Checking commission status for: ${clientReference}`);

      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID;
      if (!hubtelPrepaidDepositID) {
        throw new Error('HUBTEL_PREPAID_DEPOSIT_ID environment variable is required');
      }

      const url = `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/status/${clientReference}`;

      const response = await axios.get(url, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Basic ${process.env.HUBTEL_AUTH_TOKEN}`
        }
      });

      this.logger.log(`Commission status response: ${JSON.stringify(response.data)}`);

      return response.data;

    } catch (error) {
      this.logger.error(`Error checking commission status: ${error.message}`);
      if (error.response) {
        this.logger.error(`Hubtel response status: ${error.response.status}`);
        this.logger.error(`Hubtel response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Log commission transaction
   */
  private async logCommissionTransaction(request: CommissionServiceRequest, response: any): Promise<void> {
    try {
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      
      // Create unique SessionId to avoid duplicate key errors
      const uniqueSessionId = `${request.clientReference}_${timestamp}_${randomSuffix}`;
      
      const transaction = new this.transactionModel({
        SessionId: uniqueSessionId,
        OrderId: request.clientReference,
        ExtraData: {
          type: 'commission_service',
          serviceType: request.serviceType,
          network: request.network,
          tvProvider: request.tvProvider,
          utilityProvider: request.utilityProvider,
          destination: request.destination,
          amount: request.amount,
          extraData: request.extraData,
          response: response,
          originalClientReference: request.clientReference
        },
        CustomerMobileNumber: request.destination,
        Status: response.ResponseCode === '0000' ? 'success' : 'pending',
        OrderDate: new Date(),
        Currency: 'GHS',
        Subtotal: request.amount,
        PaymentType: 'commission_service',
        AmountPaid: request.amount,
        PaymentDate: new Date(),
        IsSuccessful: response.ResponseCode === '0000',
        createdAt: new Date()
      });

      await transaction.save();
      this.logger.log(`Commission transaction logged with SessionId: ${uniqueSessionId}`);
    } catch (error) {
      this.logger.error(`Error logging commission transaction: ${error.message}`);
    }
  }

  /**
   * Get commission service statistics
   */
  async getCommissionStatistics(): Promise<any> {
    try {
      const totalTransactions = await this.transactionModel.countDocuments({
        'ExtraData.type': 'commission_service'
      });

      const successfulTransactions = await this.transactionModel.countDocuments({
        'ExtraData.type': 'commission_service',
        IsSuccessful: true
      });

      const failedTransactions = await this.transactionModel.countDocuments({
        'ExtraData.type': 'commission_service',
        IsSuccessful: false
      });

      const totalAmount = await this.transactionModel.aggregate([
        {
          $match: {
            'ExtraData.type': 'commission_service',
            IsSuccessful: true
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$AmountPaid' }
          }
        }
      ]);

      return {
        totalTransactions,
        successfulTransactions,
        failedTransactions,
        successRate: totalTransactions > 0 ? (successfulTransactions / totalTransactions * 100).toFixed(2) : 0,
        totalAmount: totalAmount[0]?.total || 0
      };

    } catch (error) {
      this.logger.error(`Error getting commission statistics: ${error.message}`);
      return {};
    }
  }
}
