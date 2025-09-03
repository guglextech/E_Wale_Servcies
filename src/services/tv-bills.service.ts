import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { 
  TVAccountQueryDto, 
  TVBillPaymentDto, 
  TVBillPaymentRequestDto,
  TVProvider,
  TVAccountQueryResponse,
  TVAccountInfo
} from '../models/dto/tv-bills.dto';
import { Transactions } from '../models/schemas/transaction.schema';

@Injectable()
export class TVBillsService {
  private readonly logger = new Logger(TVBillsService.name);

  constructor(
    @InjectModel(Transactions.name) private readonly transactionModel: Model<Transactions>,
  ) {}

  // Hubtel API endpoints for different TV providers
  private readonly hubtelEndpoints = {
    [TVProvider.DSTV]: '297a96656b5846ad8b00d5d41b256ea7',
    [TVProvider.GOTV]: 'e6ceac7f3880435cb30b048e9617eb41',
    [TVProvider.STARTIMES]: '6598652d34ea4112949c93c079c501ce'
  };

  async queryAccount(tvQueryDto: TVAccountQueryDto): Promise<TVAccountQueryResponse> {
    try {
      const endpoint = this.hubtelEndpoints[tvQueryDto.provider];
      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID || '2023298';

      const response = await axios.get(
        `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}?destination=${tvQueryDto.accountNumber}`,
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
        type: 'tv_account_query',
        provider: tvQueryDto.provider,
        accountNumber: tvQueryDto.accountNumber,
        response: response.data
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error querying TV account: ${error.message}`);
      throw error;
    }
  }

  async payBill(tvBillDto: TVBillPaymentDto): Promise<any> {
    try {
      const endpoint = this.hubtelEndpoints[tvBillDto.provider];
      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID || '2023298';

      // Validate amount format (2 decimal places)
      if (tvBillDto.amount % 0.01 !== 0) {
        throw new Error('Amount must have maximum 2 decimal places');
      }

      const requestPayload: TVBillPaymentRequestDto = {
        Destination: tvBillDto.accountNumber,
        Amount: tvBillDto.amount,
        CallbackUrl: `${process.env.HB_CALLBACK_URL}`,
        ClientReference: tvBillDto.clientReference
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
        type: 'tv_bill_payment',
        provider: tvBillDto.provider,
        accountNumber: tvBillDto.accountNumber,
        amount: tvBillDto.amount,
        clientReference: tvBillDto.clientReference,
        response: response.data
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error paying TV bill: ${error.message}`);
      throw error;
    }
  }

  async handleTVBillCallback(callbackData: any): Promise<void> {
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

      this.logger.log(`TV bill callback processed for ${callbackData.ClientReference}`);
    } catch (error) {
      this.logger.error(`Error processing TV bill callback: ${error.message}`);
      throw error;
    }
  }

  // Helper method to format account info for USSD display
  formatAccountInfo(accountData: TVAccountInfo[]): string {
    const accountInfo = accountData.reduce((acc, item) => {
      acc[item.Display.toLowerCase()] = item.Value;
      return acc;
    }, {} as any);

    let display = '';
    
    if (accountInfo.name) {
      display += `Name: ${accountInfo.name}\n`;
    }
    if (accountInfo.account || accountInfo['account number']) {
      display += `Account: ${accountInfo.account || accountInfo['account number']}\n`;
    }
    if (accountInfo.amountdue) {
      display += `Amount Due: GHS ${accountInfo.amountdue}\n`;
    }
    if (accountInfo.bouquet) {
      display += `Bouquet: ${accountInfo.bouquet}\n`;
    }

    return display.trim();
  }

  // Helper method to validate account number format
  validateAccountNumber(accountNumber: string, provider: TVProvider): boolean {
    // Basic validation - can be enhanced based on specific provider requirements
    if (!accountNumber || accountNumber.trim().length === 0) {
      return false;
    }

    switch (provider) {
      case TVProvider.DSTV:
      case TVProvider.GOTV:
        // DSTV/GoTV account numbers are typically 10 digits
        return /^\d{10}$/.test(accountNumber);
      case TVProvider.STARTIMES:
        // StarTimes account numbers can vary in length
        return /^\d{8,12}$/.test(accountNumber);
      default:
        return true;
    }
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
}
