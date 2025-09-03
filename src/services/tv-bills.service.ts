import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { 
  TVAccountQueryDto, 
  TVBillPaymentDto, 
  TVBillPaymentRequestDto,
  TVProvider,
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

  /**
   * Create a payment request for TV bill payment
   * This follows the payment-first approach like USSD flow
   */
  async createTVBillPaymentRequest(tvBillDto: TVBillPaymentDto): Promise<any> {
    try {
      // Validate amount format (2 decimal places)
      const decimalPlaces = (tvBillDto.amount.toString().split('.')[1] || '').length;
      if (decimalPlaces > 2) {
        throw new Error('Enter valid amount (e.g., 10.50)');
      }

      // Create payment request payload
      const paymentPayload = {
        totalAmount: tvBillDto.amount,
        description: `${tvBillDto.provider} bill payment for ${tvBillDto.accountNumber}`,
        clientReference: tvBillDto.clientReference,
        merchantAccountNumber: process.env.HUBTEL_POS_SALES_ID,
        callbackUrl: tvBillDto.callbackUrl,
        returnUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/payment/return`,
        cancellationUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/payment/cancel`,
      };

      // Get Hubtel POS ID for payments
      const hubtelPosId = process.env.HUBTEL_POS_SALES_ID;
      if (!hubtelPosId) {
        throw new Error('HUBTEL_POS_SALES_ID environment variable is required');
      }

      this.logger.log(`Creating payment request for TV bill - Amount: ${tvBillDto.amount}, Provider: ${tvBillDto.provider}, Account: ${tvBillDto.accountNumber}`);

      // Create payment request via Hubtel Payment API
      const response = await axios.post(
        "https://payproxyapi.hubtel.com/items/initiate",
        paymentPayload,
        {
          headers: {
            'Authorization': `Basic ${process.env.HUBTEL_AUTH_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      this.logger.log(`Payment request created successfully - Response: ${JSON.stringify(response.data)}`);

      // Log the payment request
      await this.logTransaction({
        type: 'tv_bill_payment_request',
        provider: tvBillDto.provider,
        accountNumber: tvBillDto.accountNumber,
        amount: tvBillDto.amount,
        clientReference: tvBillDto.clientReference,
        response: response.data,
        status: 'pending'
      });

      return {
        success: true,
        data: {
          paymentUrl: response.data.data?.checkoutDirectUrl,
          checkoutId: response.data.data?.checkoutId,
          clientReference: tvBillDto.clientReference,
          amount: tvBillDto.amount,
          provider: tvBillDto.provider,
          accountNumber: tvBillDto.accountNumber
        },
        message: 'Payment request created successfully. Please complete payment to process TV bill.'
      };

    } catch (error) {
      this.logger.error(`Error creating TV bill payment request: ${error.message}`);
      if (error.response) {
        this.logger.error(`Hubtel response status: ${error.response.status}`);
        this.logger.error(`Hubtel response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Process TV bill payment after successful payment
   * This is called from the payment callback
   */
  async processTVBillAfterPayment(paymentData: any): Promise<any> {
    try {
      const { provider, accountNumber, amount, clientReference } = paymentData.metadata;

      this.logger.log(`Processing TV bill payment after payment - Provider: ${provider}, Account: ${accountNumber}, Amount: ${amount}`);

      const endpoint = this.hubtelEndpoints[provider];
      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID;
      
      if (!hubtelPrepaidDepositID) {
        throw new Error('HUBTEL_PREPAID_DEPOSIT_ID environment variable is required');
      }

      const requestPayload: TVBillPaymentRequestDto = {
        Destination: accountNumber,
        Amount: amount,
        CallbackUrl: `${process.env.HB_CALLBACK_URL}`,
        ClientReference: `TVBILL_${clientReference}_${Date.now()}`
      };

      const url = `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}`;
      this.logger.log(`Processing TV bill payment via: ${url}`);

      const response = await axios.post(url, requestPayload, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Basic ${process.env.HUBTEL_AUTH_TOKEN}`
        }
      });

      this.logger.log(`TV bill payment response: ${JSON.stringify(response.data)}`);

      // Log the successful TV bill payment
      await this.logTransaction({
        type: 'tv_bill_payment_processed',
        provider: provider,
        accountNumber: accountNumber,
        amount: amount,
        clientReference: requestPayload.ClientReference,
        response: response.data,
        status: 'completed'
      });

      return response.data;

    } catch (error) {
      this.logger.error(`Error processing TV bill after payment: ${error.message}`);
      if (error.response) {
        this.logger.error(`Hubtel response status: ${error.response.status}`);
        this.logger.error(`Hubtel response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Handle payment callback from Hubtel
   * This processes the payment result and processes TV bill if successful
   */
  async handlePaymentCallback(callbackData: any): Promise<void> {
    try {
      this.logger.log(`Processing TV bill payment callback: ${JSON.stringify(callbackData)}`);

      const { clientReference, status, metadata } = callbackData;

      if (status === 'success' && metadata?.serviceType === 'tv_bill_payment') {
        // Payment successful, process TV bill
        await this.processTVBillAfterPayment(callbackData);
        
        this.logger.log(`TV bill processed successfully for payment: ${clientReference}`);
      } else {
        this.logger.log(`Payment failed or not for TV bill: ${clientReference}, Status: ${status}`);
      }

      // Update transaction status
      await this.transactionModel.findOneAndUpdate(
        { clientReference: clientReference },
        {
          $set: {
            status: status === 'success' ? 'completed' : 'failed',
            paymentStatus: status,
            callbackReceived: true,
            callbackDate: new Date()
          }
        }
      );

    } catch (error) {
      this.logger.error(`Error handling TV bill payment callback: ${error.message}`);
      throw error;
    }
  }

  async queryAccount(tvQueryDto: TVAccountQueryDto): Promise<any> {
    try {
      const endpoint = this.hubtelEndpoints[tvQueryDto.provider];
      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID || '2023298';

      const url = `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}?destination=${tvQueryDto.accountNumber}`;
      
      this.logger.log(`Querying TV account from: ${url}`);

      const response = await axios.get(url, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Basic ${process.env.HUBTEL_AUTH_TOKEN}`
        }
      });

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

  // Legacy method - kept for backward compatibility but now redirects to payment flow
  async payBill(tvBillDto: TVBillPaymentDto): Promise<any> {
    this.logger.warn('Direct TV bill payment deprecated. Use createTVBillPaymentRequest instead.');
    return this.createTVBillPaymentRequest(tvBillDto);
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

  // Helper method to validate account number format
  validateAccountNumber(accountNumber: string, provider: TVProvider): boolean {
    // Basic validation - can be enhanced based on provider-specific formats
    if (!accountNumber || accountNumber.length < 5) {
      return false;
    }

    // Provider-specific validation
    switch (provider) {
      case TVProvider.DSTV:
        // DSTV account numbers are typically 8-10 digits
        return /^\d{8,10}$/.test(accountNumber);
      case TVProvider.GOTV:
        // GoTV account numbers are typically 8-10 digits
        return /^\d{8,10}$/.test(accountNumber);
      case TVProvider.STARTIMES:
        // StarTimes account numbers can vary
        return /^\d{6,12}$/.test(accountNumber);
      default:
        return /^\d{5,12}$/.test(accountNumber);
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
    if (accountInfo.balance) {
      display += `Balance: GHS ${accountInfo.balance}\n`;
    }

    return display.trim();
  }

  private async logTransaction(transactionData: any): Promise<void> {
    try {
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const transaction = new this.transactionModel({
        SessionId: transactionData.clientReference || `session_${timestamp}_${randomSuffix}`,
        OrderId: transactionData.clientReference || `order_${timestamp}_${randomSuffix}`,
        ExtraData: {
          type: transactionData.type,
          provider: transactionData.provider,
          accountNumber: transactionData.accountNumber,
          response: transactionData.response
        },
        CustomerMobileNumber: transactionData.accountNumber || 'N/A',
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
