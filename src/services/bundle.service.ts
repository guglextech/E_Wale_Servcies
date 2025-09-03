import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
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

@Injectable()
export class BundleService {
  private readonly logger = new Logger(BundleService.name);

  constructor(
    @InjectModel(Transactions.name) private readonly transactionModel: Model<Transactions>,
    private readonly transactionStatusService: TransactionStatusService,
  ) {}

  // Hubtel API endpoints for different networks
  private readonly hubtelEndpoints = {
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

  async queryBundles(bundleQueryDto: BundleQueryDto): Promise<BundleQueryResponse> {
    try {
      const endpoint = this.hubtelEndpoints[bundleQueryDto.network].data;
      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID || '2023298';

      const response = await axios.get(
        `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}?destination=${bundleQueryDto.destination}`,
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
        type: 'bundle_query',
        network: bundleQueryDto.network,
        destination: bundleQueryDto.destination,
        response: response.data
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error querying bundles: ${error.message}`);
      throw error;
    }
  }

  async purchaseBundle(bundleDto: BundlePurchaseDto): Promise<any> {
    try {
      const endpoint = this.hubtelEndpoints[bundleDto.network].data;
      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID || '2023298';

      const requestPayload: BundlePurchaseRequestDto = {
        Destination: bundleDto.destination,
        Amount: bundleDto.amount,
        CallbackUrl: bundleDto.callbackUrl,
        ClientReference: bundleDto.clientReference,
        Extradata: {
          bundle: bundleDto.bundleValue
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
        type: 'bundle_purchase',
        bundleType: bundleDto.bundleType,
        network: bundleDto.network,
        destination: bundleDto.destination,
        bundleValue: bundleDto.bundleValue,
        amount: bundleDto.amount,
        clientReference: bundleDto.clientReference,
        response: response.data
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error purchasing bundle: ${error.message}`);
      throw error;
    }
  }

  async handleBundleCallback(callbackData: any): Promise<void> {
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

      this.logger.log(`Bundle callback processed for ${callbackData.ClientReference}`);
    } catch (error) {
      this.logger.error(`Error processing bundle callback: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get sample bundles for a network (without requiring mobile number)
   */
  async getSampleBundles(network: NetworkProvider): Promise<BundleOption[]> {
    try {
      // Use a sample mobile number to get available bundles
      const sampleMobileNumber = this.getSampleMobileNumber(network);
      
      const bundleResponse = await this.queryBundles({
        destination: sampleMobileNumber,
        network: network
      });

      if (bundleResponse.ResponseCode !== '0000') {
        this.logger.error(`Failed to fetch sample bundles for ${network}: ${bundleResponse.Message}`);
        return [];
      }

      return bundleResponse.Data || [];
    } catch (error) {
      this.logger.error(`Error fetching sample bundles for ${network}: ${error.message}`);
      return [];
    }
  }

  /**
   * Get a sample mobile number for each network
   */
  private getSampleMobileNumber(network: NetworkProvider): string {
    const sampleNumbers = {
      [NetworkProvider.MTN]: '233246912184',
      [NetworkProvider.TELECEL]: '233246912184',
      [NetworkProvider.AT]: '233246912184'
    };
    return sampleNumbers[network] || '233246912184';
  }

  // Helper method to paginate bundle options for USSD
  paginateBundles(bundles: BundleOption[], page: number = 1, itemsPerPage: number = 5): {
    items: BundleOption[];
    currentPage: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  } {
    const totalPages = Math.ceil(bundles.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const items = bundles.slice(startIndex, endIndex);

    return {
      items,
      currentPage: page,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1
    };
  }

  // Helper method to format bundle display for USSD
  formatBundleDisplay(bundle: BundleOption, index: number): string {
    return `${index + 1}. ${bundle.Display} - GHS ${bundle.Amount.toFixed(2)}`;
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

  /**
   * Check transaction status for bundle purchases
   */
  async checkBundleTransactionStatus(clientReference: string): Promise<any> {
    try {
      const statusResponse = await this.transactionStatusService.checkStatusByClientReference(clientReference);
      const summary = this.transactionStatusService.getTransactionStatusSummary(statusResponse);
      
      return {
        success: true,
        data: statusResponse,
        summary: summary,
        isSuccessful: this.transactionStatusService.isTransactionSuccessful(statusResponse),
        shouldRetry: this.transactionStatusService.shouldRetryTransaction(statusResponse),
        formattedDetails: this.transactionStatusService.getFormattedTransactionDetails(statusResponse)
      };
    } catch (error) {
      this.logger.error(`Error checking bundle transaction status: ${error.message}`);
      return {
        success: false,
        message: error.message || 'Failed to check transaction status',
        shouldRetry: true
      };
    }
  }

  /**
   * Handle pending bundle transaction status checks
   */
  async handlePendingBundleTransactions(): Promise<void> {
    try {
      const pendingTransactions = await this.transactionModel.find({
        type: 'bundle_purchase',
        Status: { $in: ['pending', 'processing'] },
        OrderDate: { $lt: new Date(Date.now() - 5 * 60 * 1000) } // 5 minutes ago
      }).exec();

      this.logger.log(`Found ${pendingTransactions.length} pending bundle transactions to check`);

      for (const transaction of pendingTransactions) {
        try {
          if (transaction.OrderId) {
            await this.checkBundleTransactionStatus(transaction.OrderId);
            this.logger.log(`Checked status for bundle transaction: ${transaction.OrderId}`);
          }
        } catch (error) {
          this.logger.error(`Error checking status for bundle transaction ${transaction.OrderId}: ${error.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error in pending bundle transaction check: ${error.message}`);
    }
  }
}
