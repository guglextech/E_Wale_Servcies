import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface SendMoneyRequest {
  recipientName: string;
  recipientMsisdn: string;
  customerEmail?: string;
  channel: 'mtn-gh' | 'vodafone-gh' | 'tigo-gh';
  amount: number;
  primaryCallbackUrl: string;
  description: string;
  clientReference: string;
}

export interface SendMoneyResponse {
  ResponseCode: string;
  Data: {
    AmountDebited: number;
    TransactionId: string;
    Description: string;
    ClientReference: string;
    ExternalTransactionId: string;
    Amount: number;
    Charges: number;
    Meta: any;
    RecipientName: string | null;
  };
}

export interface SendMoneyCallback {
  ResponseCode: string;
  Data: {
    AmountDebited: number;
    TransactionId: string;
    ExternalTransactionId: string | null;
    Description: string;
    ClientReference: string;
    Amount: number;
    Charges: number;
    Meta: any;
    RecipientName: string | null;
  };
}

@Injectable()
export class SendMoneyService {
  private readonly logger = new Logger(SendMoneyService.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * Send money to a mobile money wallet using Hubtel API
   */
  async sendMoney(request: SendMoneyRequest): Promise<SendMoneyResponse> {
    try {
      const hubtelPrepaidDepositID = this.getRequiredEnvVar('HUBTEL_PREPAID_DEPOSIT_ID');
      const hubtelAuthToken = this.getRequiredEnvVar('HUBTEL_AUTH_TOKEN');

      const url = `https://smp.hubtel.com/api/merchants/${hubtelPrepaidDepositID}/send/mobilemoney`;

      // const payload = {
      //   RecipientName: request.recipientName,
      //   RecipientMsisdn: request.recipientMsisdn,
      //   CustomerEmail: request.customerEmail,
      //   Channel: request.channel,
      //   Amount: Math.floor(request.amount * 100) / 100, 
      //   PrimaryCallbackURL: request.primaryCallbackUrl,
      //   Description: request.description,
      //   ClientReference: request.clientReference
      // };
      const payload = {};

      this.logger.log(`Sending money via Hubtel API: ${JSON.stringify(payload)}`);

      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${hubtelAuthToken}`,
            'Accept': 'application/json'
          }
        })
      );

      this.logger.log(`Send money response: ${JSON.stringify(response.data)}`);
      return response.data;

    } catch (error) {
      this.logger.error(`Error sending money: ${error.message}`);
      if (error.response) {
        this.logger.error(`Hubtel API error response: ${JSON.stringify(error.response.data)}`);
        throw new BadRequestException(`Send money failed: ${error.response.data?.Description || error.message}`);
      }
      throw new BadRequestException(`Send money failed: ${error.message}`);
    }
  }

  /**
   * Check send money transaction status
   */
  async checkTransactionStatus(clientReference: string): Promise<any> {
    try {
      const hubtelPrepaidDepositID = this.getRequiredEnvVar('HUBTEL_PREPAID_DEPOSIT_ID');
      const hubtelAuthToken = this.getRequiredEnvVar('HUBTEL_AUTH_TOKEN');
      const url = `https://smrsc.hubtel.com/api/merchants/${hubtelPrepaidDepositID}/transactions/status`;

      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: { clientReference },
          headers: {
            'Authorization': `Basic ${hubtelAuthToken}`,
            'Accept': 'application/json'
          }
        })
      );

      this.logger.log(`Transaction status response: ${JSON.stringify(response.data)}`);
      return response.data;

    } catch (error) {
      this.logger.error(`Error checking transaction status: ${error.message}`);
      if (error.response) {
        this.logger.error(`Hubtel API error response: ${JSON.stringify(error.response.data)}`);
        throw new BadRequestException(`Status check failed: ${error.response.data?.Description || error.message}`);
      }
      throw new BadRequestException(`Status check failed: ${error.message}`);
    }
  }

  /**
   * Determine mobile money channel based on phone number
   */
  determineChannel(phoneNumber: string): 'mtn-gh' | 'vodafone-gh' | 'tigo-gh' {
    // Remove country code and get the first 3 digits after 233
    const cleanNumber = phoneNumber.replace(/^233/, '');
    const prefix = cleanNumber.substring(0, 3);

    // MTN Ghana prefixes
    if (['024', '054', '055', '059'].includes(prefix)) {
      return 'mtn-gh';
    }
    
    // Vodafone Ghana prefixes
    if (['020', '050'].includes(prefix)) {
      return 'vodafone-gh';
    }
    
    // Tigo Ghana prefixes
    if (['026', '027', '056', '057'].includes(prefix)) {
      return 'tigo-gh';
    }

    // Default to MTN if prefix is not recognized
    this.logger.warn(`Unknown prefix ${prefix} for number ${phoneNumber}, defaulting to MTN`);
    return 'mtn-gh';
  }

  /**
   * Format phone number to international format
   */
  formatPhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // If it starts with 0, replace with 233
    if (cleaned.startsWith('0')) {
      return '233' + cleaned.substring(1);
    }
    
    // If it doesn't start with 233, add it
    if (!cleaned.startsWith('233')) {
      return '233' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Handle send money callback from Hubtel
   */
  async handleSendMoneyCallback(callback: SendMoneyCallback): Promise<void> {
    try {
      this.logger.log(`Received send money callback: ${JSON.stringify(callback)}`);
      
      const { ResponseCode, Data } = callback;
      
      if (ResponseCode === '0000') {
        this.logger.log(`Send money successful for client reference: ${Data.ClientReference}`);
        // TODO: Update withdrawal status to completed
      } else {
        this.logger.error(`Send money failed for client reference: ${Data.ClientReference}, ResponseCode: ${ResponseCode}`);
        // TODO: Update withdrawal status to failed
      }
      
    } catch (error) {
      this.logger.error(`Error handling send money callback: ${error.message}`);
    }
  }

  /**
   * Get required environment variable
   */
  private getRequiredEnvVar(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`${key} environment variable is required`);
    }
    return value;
  }
}
