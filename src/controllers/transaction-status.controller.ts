import { Controller, Get, Query, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { TransactionStatusService } from '../services/transaction-status.service';
import { TransactionStatusQueryDto } from '../models/dto/transaction-status.dto';

@Controller('transaction-status')
export class TransactionStatusController {
  constructor(private readonly transactionStatusService: TransactionStatusService) {}

  @Get('check')
  async checkTransactionStatus(@Query() queryDto: TransactionStatusQueryDto) {
    try {
      const result = await this.transactionStatusService.checkTransactionStatus(queryDto);
      
      if (!result) {
        return {
          success: false,
          message: 'Transaction not found or error occurred'
        };
      }

      const summary = this.transactionStatusService.getTransactionStatusSummary(result);
      
      return {
        success: true,
        data: result,
        summary: summary,
        message: 'Transaction status check completed'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to check transaction status',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Get('check/client-reference')
  async checkStatusByClientReference(@Query('clientReference') clientReference: string) {
    try {
      if (!clientReference) {
        throw new Error('Client reference is required');
      }

      const result = await this.transactionStatusService.checkStatusByClientReference(clientReference);
      
      if (!result) {
        return {
          success: false,
          message: 'Transaction not found or error occurred'
        };
      }

      const summary = this.transactionStatusService.getTransactionStatusSummary(result);
      
      return {
        success: true,
        data: result,
        summary: summary,
        message: 'Transaction status check completed'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to check transaction status',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Get('check/hubtel-transaction-id')
  async checkStatusByHubtelTransactionId(@Query('hubtelTransactionId') hubtelTransactionId: string) {
    try {
      if (!hubtelTransactionId) {
        throw new Error('Hubtel transaction ID is required');
      }

      const result = await this.transactionStatusService.checkStatusByHubtelTransactionId(hubtelTransactionId);
      
      if (!result) {
        return {
          success: false,
          message: 'Transaction not found or error occurred'
        };
      }

      const summary = this.transactionStatusService.getTransactionStatusSummary(result);
      
      return {
        success: true,
        data: result,
        summary: summary,
        message: 'Transaction status check completed'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to check transaction status',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Get('check/network-transaction-id')
  async checkStatusByNetworkTransactionId(@Query('networkTransactionId') networkTransactionId: string) {
    try {
      if (!networkTransactionId) {
        throw new Error('Network transaction ID is required');
      }

      const result = await this.transactionStatusService.checkStatusByNetworkTransactionId(networkTransactionId);
      
      if (!result) {
        return {
          success: false,
          message: 'Transaction not found or error occurred'
        };
      }

      const summary = this.transactionStatusService.getTransactionStatusSummary(result);
      
      return {
        success: true,
        data: result,
        summary: summary,
        message: 'Transaction status check completed'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to check transaction status',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('batch-check')
  async batchCheckTransactionStatus(@Body() body: { clientReferences: string[] }) {
    try {
      if (!body.clientReferences || !Array.isArray(body.clientReferences) || body.clientReferences.length === 0) {
        throw new Error('Client references array is required');
      }

      if (body.clientReferences.length > 10) {
        throw new Error('Maximum 10 client references allowed per batch check');
      }

      const results = await this.transactionStatusService.batchCheckTransactionStatuses(body.clientReferences);
      
      // Process results to include summaries
      const processedResults = {};
      for (const [clientReference, result] of results.entries()) {
        const summary = this.transactionStatusService.getTransactionStatusSummary(result);
        processedResults[clientReference] = {
          data: result,
          summary: summary
        };
      }

      return {
        success: true,
        data: processedResults,
        message: `Batch transaction status check completed for ${body.clientReferences.length} transactions`
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to perform batch transaction status check',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('check-pending')
  async checkPendingTransactions(@Query('olderThanMinutes') olderThanMinutes?: number) {
    try {
      const minutes = olderThanMinutes ? parseInt(olderThanMinutes.toString()) : 5;
      
      if (minutes < 1 || minutes > 60) {
        throw new Error('Older than minutes must be between 1 and 60');
      }

      await this.transactionStatusService.checkPendingTransactions();
      
      return {
        success: true,
        message: `Pending transaction check completed for transactions older than ${minutes} minutes`
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to check pending transactions',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Get('summary')
  async getTransactionSummary(@Query('clientReference') clientReference: string) {
    try {
      if (!clientReference) {
        throw new Error('Client reference is required');
      }

      const result = await this.transactionStatusService.checkStatusByClientReference(clientReference);
      
      if (!result) {
        return {
          success: false,
          message: 'Transaction not found or error occurred'
        };
      }

      const summary = this.transactionStatusService.getTransactionStatusSummary(result);
      
      return {
        success: true,
        summary: summary,
        isSuccessful: this.transactionStatusService.isTransactionSuccessful(result),
        shouldRetry: this.transactionStatusService.shouldRetryTransaction(result),
        message: summary.message
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to get transaction summary',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }
}