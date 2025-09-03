import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { 
  ECGMeterQueryDto, 
  ECGTopUpDto, 
  ECGTopUpRequestDto,
  GhanaWaterQueryDto, 
  GhanaWaterTopUpDto, 
  GhanaWaterTopUpRequestDto,
  UtilityProvider,
  UtilityQueryResponse
} from '../models/dto/utility.dto';
import { Transactions } from '../models/schemas/transaction.schema';

@Injectable()
export class UtilityService {
  private readonly logger = new Logger(UtilityService.name);

  constructor(
    @InjectModel(Transactions.name) private readonly transactionModel: Model<Transactions>,
  ) {}

  // Hubtel API endpoints for different utility providers
  private readonly hubtelEndpoints = {
    [UtilityProvider.ECG]: 'b230733cd56b4a0fad820e39f66bc27c',
    [UtilityProvider.GHANA_WATER]: 'fa27127ba039455da04a2ac8a1613e00'
  };

  /**
   * Create a payment request for ECG top-up
   * This follows the payment-first approach like USSD flow
   */
  async createECGTopUpPaymentRequest(ecgTopUpDto: ECGTopUpDto): Promise<any> {
    try {
      // Validate amount format (2 decimal places)
      const decimalPlaces = (ecgTopUpDto.amount.toString().split('.')[1] || '').length;
      if (decimalPlaces > 2) {
        throw new Error('Enter valid amount (e.g., 10.50)');
      }

      // Validate mobile number format
      let mobileNumber = ecgTopUpDto.mobileNumber;
      if (!mobileNumber.startsWith('233')) {
        if (mobileNumber.startsWith('0')) {
          mobileNumber = '233' + mobileNumber.substring(1);
        } else if (mobileNumber.length === 9) {
          mobileNumber = '233' + mobileNumber;
        }
      }

      // Create payment request payload
      const paymentPayload = {
        totalAmount: ecgTopUpDto.amount,
        description: `ECG top-up for meter ${ecgTopUpDto.meterNumber}`,
        clientReference: ecgTopUpDto.clientReference,
        merchantAccountNumber: process.env.HUBTEL_POS_SALES_ID,
        callbackUrl: ecgTopUpDto.callbackUrl,
        returnUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/payment/return`,
        cancellationUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/payment/cancel`,
      };

      // Get Hubtel POS ID for payments
      const hubtelPosId = process.env.HUBTEL_POS_SALES_ID;
      if (!hubtelPosId) {
        throw new Error('HUBTEL_POS_SALES_ID environment variable is required');
      }

      this.logger.log(`Creating payment request for ECG top-up - Amount: ${ecgTopUpDto.amount}, Meter: ${ecgTopUpDto.meterNumber}, Mobile: ${mobileNumber}`);

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
        type: 'ecg_topup_payment_request',
        mobileNumber: mobileNumber,
        meterNumber: ecgTopUpDto.meterNumber,
        amount: ecgTopUpDto.amount,
        clientReference: ecgTopUpDto.clientReference,
        response: response.data,
        status: 'pending'
      });

      return {
        success: true,
        data: {
          paymentUrl: response.data.data?.checkoutDirectUrl,
          checkoutId: response.data.data?.checkoutId,
          clientReference: ecgTopUpDto.clientReference,
          amount: ecgTopUpDto.amount,
          mobileNumber: mobileNumber,
          meterNumber: ecgTopUpDto.meterNumber
        },
        message: 'Payment request created successfully. Please complete payment to process ECG top-up.'
      };

    } catch (error) {
      this.logger.error(`Error creating ECG top-up payment request: ${error.message}`);
      if (error.response) {
        this.logger.error(`Hubtel response status: ${error.response.status}`);
        this.logger.error(`Hubtel response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Create a payment request for Ghana Water top-up
   * This follows the payment-first approach like USSD flow
   */
  async createGhanaWaterTopUpPaymentRequest(ghanaWaterTopUpDto: GhanaWaterTopUpDto): Promise<any> {
    try {
      // Validate amount format (2 decimal places)
      const decimalPlaces = (ghanaWaterTopUpDto.amount.toString().split('.')[1] || '').length;
      if (decimalPlaces > 2) {
        throw new Error('Enter valid amount (e.g., 10.50)');
      }

      // Create payment request payload
      const paymentPayload = {
        totalAmount: ghanaWaterTopUpDto.amount,
        description: `Ghana Water top-up for meter ${ghanaWaterTopUpDto.meterNumber}`,
        clientReference: ghanaWaterTopUpDto.clientReference,
        merchantAccountNumber: process.env.HUBTEL_POS_SALES_ID,
        callbackUrl: ghanaWaterTopUpDto.callbackUrl,
        returnUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/payment/return`,
        cancellationUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/payment/cancel`,
      };

      // Get Hubtel POS ID for payments
      const hubtelPosId = process.env.HUBTEL_POS_SALES_ID;
      if (!hubtelPosId) {
        throw new Error('HUBTEL_POS_SALES_ID environment variable is required');
      }

      this.logger.log(`Creating payment request for Ghana Water top-up - Amount: ${ghanaWaterTopUpDto.amount}, Meter: ${ghanaWaterTopUpDto.meterNumber}`);

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
        type: 'ghana_water_topup_payment_request',
        meterNumber: ghanaWaterTopUpDto.meterNumber,
        email: ghanaWaterTopUpDto.email,
        sessionId: ghanaWaterTopUpDto.sessionId,
        amount: ghanaWaterTopUpDto.amount,
        clientReference: ghanaWaterTopUpDto.clientReference,
        response: response.data,
        status: 'pending'
      });

      return {
        success: true,
        data: {
          paymentUrl: response.data.data?.checkoutDirectUrl,
          checkoutId: response.data.data?.checkoutId,
          clientReference: ghanaWaterTopUpDto.clientReference,
          amount: ghanaWaterTopUpDto.amount,
          meterNumber: ghanaWaterTopUpDto.meterNumber,
          email: ghanaWaterTopUpDto.email
        },
        message: 'Payment request created successfully. Please complete payment to process Ghana Water top-up.'
      };

    } catch (error) {
      this.logger.error(`Error creating Ghana Water top-up payment request: ${error.message}`);
      if (error.response) {
        this.logger.error(`Hubtel response status: ${error.response.status}`);
        this.logger.error(`Hubtel response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Process ECG top-up after successful payment
   * This is called from the payment callback
   */
  async processECGTopUpAfterPayment(paymentData: any): Promise<any> {
    try {
      const { mobileNumber, meterNumber, amount, clientReference } = paymentData.metadata;

      this.logger.log(`Processing ECG top-up after payment - Mobile: ${mobileNumber}, Meter: ${meterNumber}, Amount: ${amount}`);

      const endpoint = this.hubtelEndpoints[UtilityProvider.ECG];
      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID;
      
      if (!hubtelPrepaidDepositID) {
        throw new Error('HUBTEL_PREPAID_DEPOSIT_ID environment variable is required');
      }

      const requestPayload: ECGTopUpRequestDto = {
        Destination: mobileNumber,
        Amount: amount,
        CallbackUrl: `${process.env.HB_CALLBACK_URL}`,
        ClientReference: `ECG_${clientReference}_${Date.now()}`,
        Extradata: {
          bundle: meterNumber
        }
      };

      const url = `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}`;
      this.logger.log(`Processing ECG top-up via: ${url}`);

      const response = await axios.post(url, requestPayload, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Basic ${process.env.HUBTEL_AUTH_TOKEN}`
        }
      });

      this.logger.log(`ECG top-up response: ${JSON.stringify(response.data)}`);

      // Log the successful ECG top-up
      await this.logTransaction({
        type: 'ecg_topup_processed',
        mobileNumber: mobileNumber,
        meterNumber: meterNumber,
        amount: amount,
        clientReference: requestPayload.ClientReference,
        response: response.data,
        status: 'completed'
      });

      return response.data;

    } catch (error) {
      this.logger.error(`Error processing ECG top-up after payment: ${error.message}`);
      if (error.response) {
        this.logger.error(`Hubtel response status: ${error.response.status}`);
        this.logger.error(`Hubtel response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Process Ghana Water top-up after successful payment
   * This is called from the payment callback
   */
  async processGhanaWaterTopUpAfterPayment(paymentData: any): Promise<any> {
    try {
      const { meterNumber, email, sessionId, amount, clientReference } = paymentData.metadata;

      this.logger.log(`Processing Ghana Water top-up after payment - Meter: ${meterNumber}, Amount: ${amount}`);

      const endpoint = this.hubtelEndpoints[UtilityProvider.GHANA_WATER];
      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID;
      
      if (!hubtelPrepaidDepositID) {
        throw new Error('HUBTEL_PREPAID_DEPOSIT_ID environment variable is required');
      }

      const requestPayload: GhanaWaterTopUpRequestDto = {
        Destination: meterNumber,
        Amount: amount,
        Extradata: {
          bundle: meterNumber,
          Email: email,
          SessionId: sessionId
        },
        CallbackUrl: `${process.env.HB_CALLBACK_URL}`,
        ClientReference: `GHANAWATER_${clientReference}_${Date.now()}`
      };

      const url = `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}`;
      this.logger.log(`Processing Ghana Water top-up via: ${url}`);

      const response = await axios.post(url, requestPayload, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Basic ${process.env.HUBTEL_AUTH_TOKEN}`
        }
      });

      this.logger.log(`Ghana Water top-up response: ${JSON.stringify(response.data)}`);

      // Log the successful Ghana Water top-up
      await this.logTransaction({
        type: 'ghana_water_topup_processed',
        meterNumber: meterNumber,
        email: email,
        sessionId: sessionId,
        amount: amount,
        clientReference: requestPayload.ClientReference,
        response: response.data,
        status: 'completed'
      });

      return response.data;

    } catch (error) {
      this.logger.error(`Error processing Ghana Water top-up after payment: ${error.message}`);
      if (error.response) {
        this.logger.error(`Hubtel response status: ${error.response.status}`);
        this.logger.error(`Hubtel response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Handle payment callback from Hubtel
   * This processes the payment result and processes utility top-up if successful
   */
  async handlePaymentCallback(callbackData: any): Promise<void> {
    try {
      this.logger.log(`Processing utility payment callback: ${JSON.stringify(callbackData)}`);

      const { clientReference, status, metadata } = callbackData;

      if (status === 'success') {
        if (metadata?.serviceType === 'ecg_topup') {
          // Payment successful, process ECG top-up
          await this.processECGTopUpAfterPayment(callbackData);
          this.logger.log(`ECG top-up processed successfully for payment: ${clientReference}`);
        } else if (metadata?.serviceType === 'ghana_water_topup') {
          // Payment successful, process Ghana Water top-up
          await this.processGhanaWaterTopUpAfterPayment(callbackData);
          this.logger.log(`Ghana Water top-up processed successfully for payment: ${clientReference}`);
        }
      } else {
        this.logger.log(`Payment failed: ${clientReference}, Status: ${status}`);
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
      this.logger.error(`Error handling utility payment callback: ${error.message}`);
      throw error;
    }
  }

  async queryECGMeters(ecgQueryDto: ECGMeterQueryDto): Promise<UtilityQueryResponse> {
    try {
      const endpoint = this.hubtelEndpoints[UtilityProvider.ECG];
      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID || '2023298';

      const response = await axios.get(
        `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}?destination=${ecgQueryDto.mobileNumber}`,
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
        type: 'ecg_meter_query',
        mobileNumber: ecgQueryDto.mobileNumber,
        response: response.data
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error querying ECG meters: ${error.message}`);
      throw error;
    }
  }

  async queryGhanaWaterAccount(ghanaWaterQueryDto: GhanaWaterQueryDto): Promise<UtilityQueryResponse> {
    try {
      const endpoint = this.hubtelEndpoints[UtilityProvider.GHANA_WATER];
      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID || '2023298';

      const response = await axios.get(
        `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}?destination=${ghanaWaterQueryDto.meterNumber}&mobile=${ghanaWaterQueryDto.mobileNumber}`,
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
        type: 'ghana_water_query',
        meterNumber: ghanaWaterQueryDto.meterNumber,
        mobileNumber: ghanaWaterQueryDto.mobileNumber,
        response: response.data
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error querying Ghana Water account: ${error.message}`);
      throw error;
    }
  }

  // Legacy methods - kept for backward compatibility but now redirect to payment flow
  async topUpECG(ecgTopUpDto: ECGTopUpDto): Promise<any> {
    this.logger.warn('Direct ECG top-up deprecated. Use createECGTopUpPaymentRequest instead.');
    return this.createECGTopUpPaymentRequest(ecgTopUpDto);
  }

  async topUpGhanaWater(ghanaWaterTopUpDto: GhanaWaterTopUpDto): Promise<any> {
    this.logger.warn('Direct Ghana Water top-up deprecated. Use createGhanaWaterTopUpPaymentRequest instead.');
    return this.createGhanaWaterTopUpPaymentRequest(ghanaWaterTopUpDto);
  }

  async handleECGCallback(callbackData: any): Promise<void> {
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

      this.logger.log(`ECG callback processed for ${callbackData.ClientReference}`);
    } catch (error) {
      this.logger.error(`Error processing ECG callback: ${error.message}`);
      throw error;
    }
  }

  async handleGhanaWaterCallback(callbackData: any): Promise<void> {
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

      this.logger.log(`Ghana Water callback processed for ${callbackData.ClientReference}`);
    } catch (error) {
      this.logger.error(`Error processing Ghana Water callback: ${error.message}`);
      throw error;
    }
  }

  // Helper method to validate and convert mobile number
  validateAndConvertMobileNumber(mobileNumber: string): { isValid: boolean; convertedNumber?: string; error?: string } {
    const convertedNumber = this.convertToInternationalFormat(mobileNumber);
    
    // Check if the converted number is valid
    if (this.validateMobileNumber(convertedNumber)) {
      return { isValid: true, convertedNumber };
    }
    
    // Provide specific error messages
    if (mobileNumber.length < 9) {
      return { isValid: false, error: 'Mobile number too short' };
    }
    
    if (mobileNumber.length > 11) {
      return { isValid: false, error: 'Mobile number too long' };
    }
    
    return { isValid: false, error: 'Invalid mobile number format' };
  }

  // Helper method to validate ECG meter number format
  validateECGMeterNumber(meterNumber: string): boolean {
    // ECG meter numbers can vary in format
    return /^[A-Z0-9]{8,12}$/.test(meterNumber.trim());
  }

  // Helper method to validate Ghana Water meter number format
  validateGhanaWaterMeterNumber(meterNumber: string): boolean {
    // Ghana Water meter numbers are typically 12 digits
    return /^\d{12}$/.test(meterNumber.trim());
  }

  // Helper method to validate email format
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Helper method to format ECG meter info for USSD display
  formatECGMeterInfo(meterData: any[]): string {
    if (!meterData || meterData.length === 0) {
      return "No meters found for this mobile number.";
    }

    const meterOptions = meterData.map((meter, index) => {
      const display = meter.Display.trim();
      const amount = meter.Amount;
      const status = amount < 0 ? "Credit" : amount > 0 ? "Debt" : "No Balance";
      return `${index + 1}. ${display} (${status}: GHS ${Math.abs(amount).toFixed(2)})`;
    }).join('\n');

    return `Available Meters:\n${meterOptions}`;
  }

  // Helper method to format Ghana Water account info for USSD display
  formatGhanaWaterInfo(accountData: any[]): string {
    const accountInfo = accountData.reduce((acc, item) => {
      acc[item.Display.toLowerCase()] = item.Value;
      return acc;
    }, {} as any);

    let display = '';
    
    if (accountInfo.name) {
      display += `Name: ${accountInfo.name}\n`;
    }
    if (accountInfo.amountdue) {
      display += `Amount Due: GHS ${accountInfo.amountdue}\n`;
    }
    if (accountInfo.sessionid) {
      display += `Session ID: ${accountInfo.sessionid}\n`;
    }

    return display.trim();
  }

  // Helper method to validate mobile number format
  validateMobileNumber(mobileNumber: string): boolean {
    // Remove any spaces or special characters
    const cleanNumber = mobileNumber.replace(/\s+/g, '').replace(/[^\d]/g, '');
    
    // Check if it's a valid Ghana mobile number
    if (cleanNumber.startsWith('233')) {
      // International format: 233 + 9 digits
      return /^233\d{9}$/.test(cleanNumber);
    } else if (cleanNumber.startsWith('0')) {
      // Local format: 0 + 9 digits
      return /^0\d{9}$/.test(cleanNumber);
    } else if (cleanNumber.length === 9) {
      // 9 digits without prefix
      return /^\d{9}$/.test(cleanNumber);
    }
    
    return false;
  }

  // Helper method to convert mobile number to international format
  convertToInternationalFormat(mobileNumber: string): string {
    const cleanNumber = mobileNumber.replace(/\s+/g, '').replace(/[^\d]/g, '');
    
    if (cleanNumber.startsWith('233')) {
      return cleanNumber;
    } else if (cleanNumber.startsWith('0')) {
      return '233' + cleanNumber.substring(1);
    } else if (cleanNumber.length === 9) {
      return '233' + cleanNumber;
    }
    
    throw new Error('Invalid mobile number format');
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
          mobileNumber: transactionData.mobileNumber,
          meterNumber: transactionData.meterNumber,
          email: transactionData.email,
          sessionId: transactionData.sessionId,
          response: transactionData.response
        },
        CustomerMobileNumber: transactionData.mobileNumber || transactionData.meterNumber || 'N/A',
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
