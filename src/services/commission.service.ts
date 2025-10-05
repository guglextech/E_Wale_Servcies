import { Injectable, Logger, Inject, forwardRef, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { Transactions } from '../models/schemas/transaction.schema';
import { NetworkProvider } from '../models/dto/airtime.dto';
import { TVProvider } from '../models/dto/tv-bills.dto';
import { UtilityProvider } from '../models/dto/utility.dto';
import { UserCommissionService } from './user-commission.service';
import { CommissionTransactionLogService } from './commission-transaction-log.service';

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
    private readonly commissionTransactionLogService: CommissionTransactionLogService,
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
   * This is the unified method that handles all commission service transactions with complete flow
   */
  async processCommissionService(request: CommissionServiceRequest): Promise<CommissionServiceResponse | null> {
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

      // Update commission transaction log status
      const commissionResponse = response.data;
      if (commissionResponse) {
        const isDelivered = commissionResponse.ResponseCode === '0000' && commissionResponse.Data?.IsFulfilled;
        await this.commissionTransactionLogService.updateCommissionServiceStatus(
          request.clientReference,
          isDelivered ? 'delivered' : 'failed',
          commissionResponse.Message,
          commissionResponse.Data?.IsFulfilled,
          isDelivered ? undefined : commissionResponse.Message
        );
      } else {
        await this.commissionTransactionLogService.updateCommissionServiceStatus(
          request.clientReference,
          'failed',
          'Commission service request failed',
          false,
          'Commission service request failed'
        );
      }

      return commissionResponse;

    } catch (error) {
      this.logger.error(`Error processing commission service: ${error.message}`);
      if (error.response) {
        this.logger.error(`Hubtel response status: ${error.response.status}`);
        this.logger.error(`Hubtel response data: ${JSON.stringify(error.response.data)}`);
      }
      
      // Update commission transaction log status on error
      await this.commissionTransactionLogService.updateCommissionServiceStatus(
        request.clientReference,
        'failed',
        'Commission service error',
        false,
        error.message || 'Commission service error'
      );
      
      return null;
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
      CallbackUrl: request.callbackUrl || this.getRequiredEnvVar('HB_CALLBACK_URL'),
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

      // Update the commission transaction with callback data
      const transaction = await this.transactionModel.findOne({ OrderId: ClientReference });

      if (transaction) {
        await this.transactionModel.findOneAndUpdate(
          { OrderId: ClientReference },
          {
            $set: {
              Status: ResponseCode === '0000' ? 'success' : 'failed',
              IsSuccessful: ResponseCode === '0000',
              'ExtraData.commissionTransactionId': TransactionId,
              'ExtraData.commissionAmount': Commission,
              'ExtraData.commissionStatus': ResponseCode === '0000' ? 'success' : 'failed',
              'ExtraData.callbackReceived': true,
              'ExtraData.callbackDate': new Date(),
              'ExtraData.responseCode': ResponseCode,
              'ExtraData.responseMessage': Message
            }
          }
        );
        this.logger.log(`Updated commission transaction ${ClientReference} with callback data`);
      } else {
        this.logger.warn(`No commission transaction found for OrderId: ${ClientReference}`);
      }

      // Process commission for user earnings if successful
      if (ResponseCode === '0000') {
        console.log('=== CALLING USER COMMISSION SERVICE ===');
        await this.userCommissionService.addCommissionEarningsToUser(callbackData);
        console.log('=== USER COMMISSION SERVICE COMPLETED ===');
      } else {
        console.log(`Commission callback failed with ResponseCode: ${ResponseCode}`);
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
   * Log commission transaction separately (not updating payment transaction)
   */
  private async logCommissionTransaction(request: CommissionServiceRequest, response: any): Promise<void> {
    try {
      // Create a separate commission transaction record
      const commissionTransaction = new this.transactionModel({
        SessionId: `comm_${request.clientReference}_${Date.now()}`,
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
          originalClientReference: request.clientReference,
          commissionTransactionId: response.Data?.TransactionId,
          commissionAmount: response.Data?.Meta?.Commission,
          commissionStatus: response.ResponseCode === '0000' ? 'success' : 'pending'
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

      await commissionTransaction.save();
      this.logger.log(`Commission transaction logged with SessionId: ${commissionTransaction.SessionId}`);
    } catch (error) {
      this.logger.error(`Error logging commission transaction: ${error.message}`);
    }
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
