import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios, { AxiosResponse } from 'axios';
import {
  BundleQueryDto,
  BundlePurchaseDto,
  BundlePurchaseRequestDto,
  NetworkProvider,
  BundleType,
  BundleQueryResponse,
  BundleOption
} from '../models/dto/bundle.dto';
import { Transactions } from '../models/schemas/transaction.schema';
import { TransactionStatusService } from './transaction-status.service';
import { CommissionService } from './commission.service';

// Types for better type safety
interface HubtelEndpoints {
  [NetworkProvider.MTN]: {
    data: string;
    fibre: string;
  };
  [NetworkProvider.TELECEL]: {
    data: string;
    broadband: string;
  };
  [NetworkProvider.AT]: {
    data: string;
  };
}

interface BundleDeliveryPayload {
  Destination: string;
  Amount: number;
  CallbackUrl: string;
  ClientReference: string;
  Extradata: {
    bundle: string;
  };
}

interface TransactionLogData {
  type: 'bundle_delivery';
  network: NetworkProvider;
  destination: string;
  bundleType: string;
  bundleValue: string;
  amount: number;
  clientReference: string;
  response?: any;
  status: 'pending' | 'completed' | 'failed';
}

@Injectable()
export class BundleService {
  private readonly logger = new Logger(BundleService.name);

  constructor(
    @InjectModel(Transactions.name) private readonly transactionModel: Model<Transactions>,
    private readonly transactionStatusService: TransactionStatusService,
    private readonly commissionService: CommissionService,
  ) { }

  // Hubtel Commission Service endpoints for different networks and services
  private readonly hubtelEndpoints: HubtelEndpoints = {
    [NetworkProvider.MTN]: {
      data: 'b230733cd56b4a0fad820e39f66bc27c',
      fibre: '39fbe120e9b542899eb7dad526fb04b9'
    },
    [NetworkProvider.TELECEL]: {
      data: 'fa27127ba039455da04a2ac8a1613e00',
      broadband: 'b9a1aa246ba748f9ba01ca4cdbb3d1d3'
    },
    [NetworkProvider.AT]: {
      data: '06abd92da459428496967612463575ca'
    }
  };

  /**
   * Deliver bundle via Hubtel Commission Service
   * This is called after payment is successful
   */
  async deliverBundle(bundleDto: BundlePurchaseDto): Promise<any> {
    try {
      this.validateBundleRequest(bundleDto);
      const destination = this.formatMobileNumber(bundleDto.destination);
      
      this.logger.log(`Delivering bundle - Network: ${bundleDto.network}, Destination: ${destination}, Bundle: ${bundleDto.bundleValue}`);

      const endpoint = this.getEndpointForBundleType(bundleDto.network, bundleDto.bundleType);
      const hubtelPrepaidDepositID = this.getRequiredEnvVar('HUBTEL_PREPAID_DEPOSIT_ID');

      const requestPayload: BundleDeliveryPayload = {
        Destination: destination,
        Amount: bundleDto.amount,
        CallbackUrl: this.getRequiredEnvVar('HB_CALLBACK_URL'),
        ClientReference: `BUNDLE_${bundleDto.clientReference}_${Date.now()}`,
        Extradata: {
          bundle: bundleDto.bundleValue
        }
      };

      const url = `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}`;
      this.logger.log(`Delivering bundle via: ${url}`);

      const response = await this.callCommissionService(url, requestPayload);
      
      await this.logTransaction({
        type: 'bundle_delivery',
        network: bundleDto.network,
        destination,
        bundleType: bundleDto.bundleType,
        bundleValue: bundleDto.bundleValue,
        amount: bundleDto.amount,
        clientReference: requestPayload.ClientReference,
        response: response.data,
        status: 'completed'
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error delivering bundle: ${error.message}`);
      this.logHubtelError(error);
      throw error;
    }
  }

  /**
   * Get available bundles for a specific network and destination
   * This method requires a valid mobile number to get actual bundle data from the API
   */
  async getAvailableBundles(network: NetworkProvider, destination: string, bundleType: string = 'data'): Promise<BundleOption[]> {
    try {
      const bundleResponse = await this.queryBundles({
        destination: destination,
        network: network,
        bundleType: bundleType
      });

      if (bundleResponse.ResponseCode !== '0000') {
        this.logger.error(`Failed to fetch bundles for ${network}: ${bundleResponse.Message}`);
        return [];
      }

      return bundleResponse.Data || [];
    } catch (error) {
      this.logger.error(`Error fetching bundles for ${network}: ${error.message}`);
      return [];
    }
  }

  /**
   * Query available bundles from Hubtel Commission Service
   */
  async queryBundles(bundleQueryDto: BundleQueryDto): Promise<BundleQueryResponse> {
    try {
      const { network, destination, bundleType = 'data' } = bundleQueryDto;

      // Determine the correct endpoint based on network and bundle type
      const endpoint = this.getEndpointForBundleType(network, bundleType);

      if (!endpoint) {
        throw new Error(`Bundle type '${bundleType}' not supported for network '${network}'`);
      }

      const hubtelPrepaidDepositID = this.getRequiredEnvVar('HUBTEL_PREPAID_DEPOSIT_ID');

      const url = `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}?destination=${destination}`;

      this.logger.log(`Querying bundles from: ${url}`);

      const response = await axios.get(url, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Basic ${this.getRequiredEnvVar('HUBTEL_AUTH_TOKEN')}`
        }
      });

      this.logger.log(`Bundle query response: ${JSON.stringify(response.data)}`);

      return response.data;
    } catch (error) {
      this.logger.error(`Error querying bundles: ${error.message}`);
      this.logHubtelError(error);
      throw error;
    }
  }

  /**
   * Handle bundle delivery callback from Hubtel Commission Service
   */
  async handleBundleCallback(callbackData: any): Promise<void> {
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

      // Also process through commission service callback handler
      await this.commissionService.processCommissionServiceCallback(callbackData);

      this.logger.log(`Bundle callback processed for ${callbackData.ClientReference}`);
    } catch (error) {
      this.logger.error(`Error processing bundle callback: ${error.message}`);
      throw error;
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Validate bundle request parameters
   */
  private validateBundleRequest(bundleDto: BundlePurchaseDto): void {
    if (bundleDto.amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    if (!bundleDto.destination || bundleDto.destination.trim().length === 0) {
      throw new BadRequestException('Destination mobile number is required');
    }

    if (!bundleDto.bundleValue || bundleDto.bundleValue.trim().length === 0) {
      throw new BadRequestException('Bundle value is required');
    }

    if (!bundleDto.network) {
      throw new BadRequestException('Network provider is required');
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
   * Get endpoint for bundle type and network
   */
  private getEndpointForBundleType(network: NetworkProvider, bundleType: string): string | null {
    const networkEndpoints = this.hubtelEndpoints[network];
    if (!networkEndpoints) {
      return null;
    }

    // Map bundle types to endpoint keys
    const endpointMap: Record<string, string> = {
      'data': 'data',
      'voice': 'data', // Voice bundles use same endpoint as data
      'fibre': 'fibre',
      'broadband': 'broadband'
    };

    const endpointKey = endpointMap[bundleType] || 'data';
    return networkEndpoints[endpointKey] || null;
  }

  /**
   * Call Hubtel Commission Service
   */
  private async callCommissionService(url: string, payload: BundleDeliveryPayload): Promise<AxiosResponse> {
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
          network: transactionData.network,
          bundleType: transactionData.bundleType,
          bundleValue: transactionData.bundleValue,
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
