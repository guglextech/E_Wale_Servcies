import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { 
  TransactionStatusQueryDto,
  TransactionStatusResponseDto,
  TransactionStatus,
  ResponseCode
} from '../models/dto/transaction-status.dto';
import { Transactions } from '../models/schemas/transaction.schema';

@Injectable()
export class TransactionStatusService {
  private readonly logger = new Logger(TransactionStatusService.name);
  private readonly posSalesId: string;
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(
    @InjectModel(Transactions.name) private readonly transactionModel: Model<Transactions>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.posSalesId = this.configService.get<string>('HUBTEL_POS_SALES_ID') || '11684';
    this.baseUrl = 'https://api-txnstatus.hubtel.com';
    this.authHeader = this.configService.get<string>('HUBTEL_AUTH_TOKEN') || '';
  }

  /**
   * Check transaction status using Hubtel API
   */
  async checkTransactionStatus(queryDto: TransactionStatusQueryDto): Promise<TransactionStatusResponseDto | null> {
    try {
      // Build query parameters
      const params: any = {};
      if (queryDto.clientReference) params.clientReference = queryDto.clientReference;
      if (queryDto.hubtelTransactionId) params.hubtelTransactionId = queryDto.hubtelTransactionId;
      if (queryDto.networkTransactionId) params.networkTransactionId = queryDto.networkTransactionId;

      // Ensure at least one parameter is provided
      if (Object.keys(params).length === 0) {
        throw new Error('At least one transaction identifier must be provided');
      }

      const url = `${this.baseUrl}/transactions/${this.posSalesId}/status`;
      
      this.logger.log(`Checking transaction status: ${url}`, params);

      const response = await firstValueFrom(
        this.httpService.get(url, {
          params,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': this.authHeader
          }
        })
      );

      const statusResponse: TransactionStatusResponseDto = response.data;
      
      // Update local transaction record
      await this.updateLocalTransactionStatus(statusResponse);
      
      return statusResponse;
    } catch (error) {
      this.logger.error(`Error checking transaction status: ${error.message}`);
      return null;
    }
  }

  /**
   * Check transaction status by client reference
   */
  async checkStatusByClientReference(clientReference: string): Promise<TransactionStatusResponseDto | null> {
    return this.checkTransactionStatus({ clientReference });
  }

  /**
   * Check transaction status by Hubtel transaction ID
   */
  async checkStatusByHubtelTransactionId(hubtelTransactionId: string): Promise<TransactionStatusResponseDto | null> {
    return this.checkTransactionStatus({ hubtelTransactionId });
  }

  /**
   * Check transaction status by network transaction ID
   */
  async checkStatusByNetworkTransactionId(networkTransactionId: string): Promise<TransactionStatusResponseDto | null> {
    return this.checkTransactionStatus({ networkTransactionId });
  }

  /**
   * Get transaction status summary
   */
  getTransactionStatusSummary(statusResponse: TransactionStatusResponseDto): {
    isSuccessful: boolean;
    status: TransactionStatus;
    message: string;
    shouldRetry: boolean;
  } {
    const { responseCode, data, message } = statusResponse;

    switch (responseCode) {
      case ResponseCode.SUCCESS:
        return {
          isSuccessful: true,
          status: data.status === 'Paid' ? TransactionStatus.PAID : TransactionStatus.UNPAID,
          message: `Transaction ${data.status.toLowerCase()}`,
          shouldRetry: false
        };

      case ResponseCode.PENDING:
        return {
          isSuccessful: false,
          status: TransactionStatus.PENDING,
          message: 'Transaction is pending. Please check again later.',
          shouldRetry: true
        };

      case ResponseCode.HTTP_FAILURE:
        return {
          isSuccessful: false,
          status: TransactionStatus.FAILED,
          message: 'Transaction state is unknown. Please contact support.',
          shouldRetry: false
        };

      case ResponseCode.GENERAL_FAILURE:
      case ResponseCode.GENERAL_FAILURE_2:
        return {
          isSuccessful: false,
          status: TransactionStatus.FAILED,
          message: message || 'General failure occurred',
          shouldRetry: false
        };

      case ResponseCode.ERROR_RETRY:
        return {
          isSuccessful: false,
          status: TransactionStatus.FAILED,
          message: 'An error occurred. Please try again later.',
          shouldRetry: true
        };

      case ResponseCode.VALIDATION_ERROR:
        return {
          isSuccessful: false,
          status: TransactionStatus.FAILED,
          message: 'Validation error. Please check your parameters.',
          shouldRetry: false
        };

      case ResponseCode.AUTH_DENIED:
        return {
          isSuccessful: false,
          status: TransactionStatus.FAILED,
          message: 'Authorization denied. Please check your API credentials.',
          shouldRetry: false
        };

      case ResponseCode.PERMISSION_DENIED:
        return {
          isSuccessful: false,
          status: TransactionStatus.FAILED,
          message: 'Permission denied. Please check your API permissions.',
          shouldRetry: false
        };

      case ResponseCode.INSUFFICIENT_BALANCE:
        return {
          isSuccessful: false,
          status: TransactionStatus.FAILED,
          message: 'Insufficient prepaid balance.',
          shouldRetry: false
        };

      default:
        return {
          isSuccessful: false,
          status: TransactionStatus.FAILED,
          message: `Unknown response code: ${responseCode}`,
          shouldRetry: false
        };
    }
  }

  /**
   * Check if transaction is successful
   */
  isTransactionSuccessful(statusResponse: TransactionStatusResponseDto): boolean {
    const summary = this.getTransactionStatusSummary(statusResponse);
    return summary.isSuccessful && summary.status === TransactionStatus.PAID;
  }

  /**
   * Check if transaction should be retried
   */
  shouldRetryTransaction(statusResponse: TransactionStatusResponseDto): boolean {
    const summary = this.getTransactionStatusSummary(statusResponse);
    return summary.shouldRetry;
  }

  /**
   * Get error message based on response code
   */
  getErrorMessage(responseCode: string, message: string): string {
    const errorMessages: { [key: string]: string } = {
      '0000': 'Success',
      '0001': 'Transaction pending. Expect callback request for final state',
      '0005': 'HTTP failure/exception. Transaction state unknown. Contact support.',
      '2000': 'General Failure Error',
      '2001': 'General Failure Error. Check response description for details.',
      '4000': 'Error occurred. Try again later or check mobile value.',
      '4010': 'Validation Errors. Check required parameters.',
      '4101': 'Authorization denied or prepaid account not found.',
      '4103': 'Permission denied. Check API keys.',
      '4075': 'Insufficient prepaid balance. Top-up required.'
    };

    return errorMessages[responseCode] || message || 'Unknown error occurred';
  }

  /**
   * Check if response code indicates retryable error
   */
  isRetryableError(responseCode: string): boolean {
    const retryableCodes = ['0001', '0005', '4000'];
    return retryableCodes.includes(responseCode);
  }

  /**
   * Batch check multiple transaction statuses
   */
  async batchCheckTransactionStatuses(clientReferences: string[]): Promise<Map<string, TransactionStatusResponseDto>> {
    const results = new Map<string, TransactionStatusResponseDto>();
    
    // Process in batches of 5 to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < clientReferences.length; i += batchSize) {
      const batch = clientReferences.slice(i, i + batchSize);
      
      const promises = batch.map(async (clientReference) => {
        const result = await this.checkStatusByClientReference(clientReference);
        if (result) {
          results.set(clientReference, result);
        }
      });

      await Promise.all(promises);
      
      // Add delay between batches to respect rate limits
      if (i + batchSize < clientReferences.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Get pending transactions that need status check
   */
  async getPendingTransactions(olderThanMinutes: number = 5): Promise<Transactions[]> {
    const cutoffTime = new Date(Date.now() - (olderThanMinutes * 60 * 1000));
    
    return this.transactionModel.find({
      Status: { $in: ['pending', 'processing'] },
      OrderDate: { $lt: cutoffTime }
    }).exec();
  }

  /**
   * Automatically check status for pending transactions
   */
  async checkPendingTransactions(): Promise<void> {
    try {
      const pendingTransactions = await this.getPendingTransactions();
      
      this.logger.log(`Found ${pendingTransactions.length} pending transactions to check`);

      for (const transaction of pendingTransactions) {
        try {
          if (transaction.OrderId) {
            await this.checkStatusByClientReference(transaction.OrderId);
            this.logger.log(`Checked status for transaction: ${transaction.OrderId}`);
          }
        } catch (error) {
          this.logger.error(`Error checking status for transaction ${transaction.OrderId}: ${error.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error in automatic pending transaction check: ${error.message}`);
    }
  }

  /**
   * Update local transaction record with status from Hubtel
   */
  private async updateLocalTransactionStatus(statusResponse: TransactionStatusResponseDto): Promise<void> {
    try {
      const { data } = statusResponse;
      const summary = this.getTransactionStatusSummary(statusResponse);

      // Find and update the transaction record
      await this.transactionModel.findOneAndUpdate(
        { OrderId: data.clientReference },
        {
          $set: {
            Status: summary.status.toLowerCase(),
            AmountAfterCharges: data.amountAfterCharges
          },
          $push: {
            ExtraData: {
              charges: data.charges,
              paymentMethod: data.paymentMethod,
              externalTransactionId: data.externalTransactionId,
              isFulfilled: data.isFulfilled,
              lastStatusCheck: new Date(),
              statusCheckResponse: statusResponse
            }
          }
        }
      );

      this.logger.log(`Updated local transaction status for ${data.clientReference}`);
    } catch (error) {
      this.logger.error(`Error updating local transaction status: ${error.message}`);
    }
  }
}