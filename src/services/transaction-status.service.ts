import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { 
  TransactionStatusQueryDto,
  TransactionStatusResponseDto,
  TransactionStatusDataDto,
  TransactionStatus,
  ResponseCode
} from '../models/dto/transaction-status.dto';
import { Transactions } from '../models/schemas/transaction.schema';

@Injectable()
export class TransactionStatusService {
  private readonly logger = new Logger(TransactionStatusService.name);

  constructor(
    @InjectModel(Transactions.name) private readonly transactionModel: Model<Transactions>,
  ) {}

  /**
   * Check transaction status using Hubtel Transaction Status API
   */
  async checkTransactionStatus(queryDto: TransactionStatusQueryDto): Promise<TransactionStatusResponseDto> {
    try {
      const posSalesId = process.env.HUBTEL_POS_SALES_ID || '11684';
      const hubtelAuthToken = process.env.HUBTEL_AUTH_TOKEN;

      if (!hubtelAuthToken) {
        throw new Error('HUBTEL_AUTH_TOKEN is not configured');
      }

      // Build query parameters
      const queryParams = new URLSearchParams();
      if (queryDto.clientReference) {
        queryParams.append('clientReference', queryDto.clientReference);
      }
      if (queryDto.hubtelTransactionId) {
        queryParams.append('hubtelTransactionId', queryDto.hubtelTransactionId);
      }
      if (queryDto.networkTransactionId) {
        queryParams.append('networkTransactionId', queryDto.networkTransactionId);
      }

      // Ensure at least one parameter is provided
      if (queryParams.toString() === '') {
        throw new Error('At least one transaction identifier must be provided');
      }

      const url = `https://api-txnstatus.hubtel.com/transactions/${posSalesId}/status?${queryParams.toString()}`;

      this.logger.log(`Checking transaction status: ${url}`);

      const response = await axios.get(url, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Basic ${hubtelAuthToken}`
        },
        timeout: 30000 // 30 seconds timeout
      });

      const statusResponse: TransactionStatusResponseDto = response.data;

      // Log the status check
      await this.logTransactionStatusCheck(queryDto, statusResponse);

      // Update local transaction record if found
      await this.updateLocalTransactionStatus(statusResponse);

      return statusResponse;
    } catch (error) {
      this.logger.error(`Error checking transaction status: ${error.message}`);
      
      if (axios.isAxiosError(error)) {
        if (error.response) {
          this.logger.error(`Hubtel API Error: ${error.response.status} - ${error.response.data}`);
          throw new Error(`Hubtel API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
          this.logger.error('No response received from Hubtel API');
          throw new Error('No response received from Hubtel API. Please try again later.');
        }
      }
      
      throw error;
    }
  }

  /**
   * Check transaction status by client reference (recommended method)
   */
  async checkStatusByClientReference(clientReference: string): Promise<TransactionStatusResponseDto> {
    return this.checkTransactionStatus({ clientReference });
  }

  /**
   * Check transaction status by Hubtel transaction ID
   */
  async checkStatusByHubtelTransactionId(hubtelTransactionId: string): Promise<TransactionStatusResponseDto> {
    return this.checkTransactionStatus({ hubtelTransactionId });
  }

  /**
   * Check transaction status by network transaction ID
   */
  async checkStatusByNetworkTransactionId(networkTransactionId: string): Promise<TransactionStatusResponseDto> {
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
   * Get formatted transaction details for display
   */
  getFormattedTransactionDetails(statusResponse: TransactionStatusResponseDto): string {
    const { data } = statusResponse;
    const summary = this.getTransactionStatusSummary(statusResponse);

    return `
Transaction Status: ${summary.status}
Amount: GHS ${data.amount.toFixed(2)}
Charges: GHS ${data.charges.toFixed(2)}
Net Amount: GHS ${data.amountAfterCharges.toFixed(2)}
Payment Method: ${data.paymentMethod}
Date: ${new Date(data.date).toLocaleString()}
Status: ${summary.message}
Transaction ID: ${data.transactionId}
${data.externalTransactionId ? `External ID: ${data.externalTransactionId}` : ''}
Fulfilled: ${data.isFulfilled ? 'Yes' : 'No'}
    `.trim();
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

  /**
   * Log transaction status check for audit purposes
   */
  private async logTransactionStatusCheck(
    queryDto: TransactionStatusQueryDto, 
    statusResponse: TransactionStatusResponseDto
  ): Promise<void> {
    try {
      const logEntry = {
        type: 'transaction_status_check',
        query: queryDto,
        response: statusResponse,
        timestamp: new Date(),
        summary: this.getTransactionStatusSummary(statusResponse)
      };

      // You can log this to a separate collection or file
      this.logger.log(`Transaction status check logged: ${JSON.stringify(logEntry)}`);
    } catch (error) {
      this.logger.error(`Error logging transaction status check: ${error.message}`);
    }
  }

  /**
   * Batch check multiple transaction statuses
   */
  async batchCheckTransactionStatus(clientReferences: string[]): Promise<{
    [clientReference: string]: TransactionStatusResponseDto
  }> {
    const results: { [clientReference: string]: TransactionStatusResponseDto } = {};

    // Check each transaction status sequentially to avoid overwhelming the API
    for (const clientReference of clientReferences) {
      try {
        const status = await this.checkTransactionStatus({ clientReference });
        results[clientReference] = status;
        
        // Add a small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        this.logger.error(`Error checking status for ${clientReference}: ${error.message}`);
        // You might want to handle this differently based on your requirements
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
      OrderDate: { $lt: cutoffTime },
      lastStatusCheck: { $exists: false }
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
}
