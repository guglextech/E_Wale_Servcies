import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { 
  TransactionStatusResponse, 
  CommissionServiceResponse 
} from "../models/dto/commission-transaction-log.dto";
import { CommissionService, CommissionServiceRequest } from "./commission.service";

@Injectable()
export class TransactionStatusCheckService {
  private readonly logger = new Logger(TransactionStatusCheckService.name);
  private readonly posSalesId: string;
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => CommissionService))
    private readonly commissionService: CommissionService
  ) {
    this.posSalesId = this.configService.get<string>('HUBTEL_POS_SALES_ID') || '11684';
    this.baseUrl = 'https://api-txnstatus.hubtel.com';
    this.authHeader = this.configService.get<string>('HUBTEL_AUTH_HEADER') || '';
  }

  /**
   * Check transaction status using client reference
   */
  async checkTransactionStatusByClientReference(clientReference: string): Promise<TransactionStatusResponse | null> {
    try {
      const url = `${this.baseUrl}/transactions/${this.posSalesId}/status`;
      const params = { clientReference };
      
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params,
          headers: {
            'Authorization': this.authHeader,
            'Content-Type': 'application/json'
          }
        })
      );

      this.logger.log(`Transaction status check successful for clientReference: ${clientReference}`);
      return response.data as TransactionStatusResponse;
    } catch (error) {
      this.logger.error(`Error checking transaction status for clientReference: ${clientReference}`, error);
      return null;
    }
  }

  /**
   * Check transaction status using Hubtel transaction ID
   */
  async checkTransactionStatusByHubtelId(hubtelTransactionId: string): Promise<TransactionStatusResponse | null> {
    try {
      const url = `${this.baseUrl}/transactions/${this.posSalesId}/status`;
      const params = { hubtelTransactionId };
      
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params,
          headers: {
            'Authorization': this.authHeader,
            'Content-Type': 'application/json'
          }
        })
      );

      this.logger.log(`Transaction status check successful for hubtelTransactionId: ${hubtelTransactionId}`);
      return response.data as TransactionStatusResponse;
    } catch (error) {
      this.logger.error(`Error checking transaction status for hubtelTransactionId: ${hubtelTransactionId}`, error);
      return null;
    }
  }

  /**
   * Check transaction status using network transaction ID
   */
  async checkTransactionStatusByNetworkId(networkTransactionId: string): Promise<TransactionStatusResponse | null> {
    try {
      const url = `${this.baseUrl}/transactions/${this.posSalesId}/status`;
      const params = { networkTransactionId };
      
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params,
          headers: {
            'Authorization': this.authHeader,
            'Content-Type': 'application/json'
          }
        })
      );

      this.logger.log(`Transaction status check successful for networkTransactionId: ${networkTransactionId}`);
      return response.data as TransactionStatusResponse;
    } catch (error) {
      this.logger.error(`Error checking transaction status for networkTransactionId: ${networkTransactionId}`, error);
      return null;
    }
  }

  /**
   * Process commission service request
   */
  async processCommissionService(request: CommissionServiceRequest): Promise<CommissionServiceResponse | null> {
    try {
      this.logger.log(`Processing commission service request for clientReference: ${request.clientReference}`);
      
      // Use the internal CommissionService instead of external URL
      const response = await this.commissionService.processCommissionService(request);
      
      this.logger.log(`Commission service request successful for clientReference: ${request.clientReference}`);
      return response as CommissionServiceResponse;
    } catch (error) {
      this.logger.error(`Error processing commission service for clientReference: ${request.clientReference}`, error);
      return null;
    }
  }

  /**
   * Determine if transaction is successful based on response code
   */
  isTransactionSuccessful(responseCode: string): boolean {
    return responseCode === '0000';
  }

  /**
   * Determine if service was fulfilled based on status and isFulfilled
   */
  isServiceFulfilled(status: string, isFulfilled: boolean | null): boolean {
    return status === 'Paid' && (isFulfilled === true);
  }

  /**
   * Get error message based on response code
   */
  getErrorMessage(responseCode: string, message: string): string {
    const errorMessages: { [key: string]: string } = {
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
  async batchCheckTransactionStatuses(clientReferences: string[]): Promise<Map<string, TransactionStatusResponse>> {
    const results = new Map<string, TransactionStatusResponse>();
    
    // Process in batches of 10 to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < clientReferences.length; i += batchSize) {
      const batch = clientReferences.slice(i, i + batchSize);
      
      const promises = batch.map(async (clientReference) => {
        const result = await this.checkTransactionStatusByClientReference(clientReference);
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
}
