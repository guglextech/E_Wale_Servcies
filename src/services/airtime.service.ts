import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { 
  AirtimeTopUpDto, 
  BundlePurchaseDto, 
  NetworkProvider, 
  BundleType,
  HubtelAirtimeResponseDto,
  AirtimeCallbackDto 
} from '../models/dto/airtime.dto';
import { Transactions } from '../models/schemas/transaction.schema';

@Injectable()
export class AirtimeService {
  private readonly logger = new Logger(AirtimeService.name);

  constructor(
    @InjectModel(Transactions.name) private readonly transactionModel: Model<Transactions>,
  ) {}

  // Hubtel API endpoints for different networks
  private readonly hubtelEndpoints = {
    [NetworkProvider.MTN]: {
      airtime: 'fdd76c884e614b1c8f669a3207b09a98',
      data: 'fdd76c884e614b1c8f669a3207b09a98', 
      voice: 'fdd76c884e614b1c8f669a3207b09a98' 
    },
    [NetworkProvider.TELECEL]: {
      airtime: 'f4be83ad74c742e185224fdae1304800',
      data: 'f4be83ad74c742e185224fdae1304800', 
      voice: 'f4be83ad74c742e185224fdae1304800' 
    },
    [NetworkProvider.AT]: {
      airtime: 'dae2142eb5a14c298eace60240c09e4b',
      data: 'dae2142eb5a14c298eace60240c09e4b', 
      voice: 'dae2142eb5a14c298eace60240c09e4b' 
    }
  };

  // Bundle prices (in GHS)
  private readonly bundlePrices = {
    [BundleType.DATA]: {
      [NetworkProvider.MTN]: 5.0,
      [NetworkProvider.TELECEL]: 4.5,
      [NetworkProvider.AT]: 4.8
    },
    [BundleType.VOICE]: {
      [NetworkProvider.MTN]: 3.0,
      [NetworkProvider.TELECEL]: 2.8,
      [NetworkProvider.AT]: 2.9
    }
  };

  /**
   * Create a payment request for airtime purchase
   * This follows the payment-first approach like USSD flow
   */
  async createAirtimePaymentRequest(airtimeDto: AirtimeTopUpDto): Promise<any> {
    try {
      // Validate amount (max 100 cedis)
      if (airtimeDto.amount > 100) {
        throw new Error('Maximum airtime top-up amount is 100 cedis');
      }

      // Validate amount format (2 decimal places)
      const decimalPlaces = (airtimeDto.amount.toString().split('.')[1] || '').length;
      if (decimalPlaces > 2) {
        throw new Error('Enter valid amount (e.g., 10.50)');
      }

      // Validate and convert mobile number format if needed
      let destination = airtimeDto.destination;
      if (!destination.startsWith('233')) {
        // Convert to international format if not already
        if (destination.startsWith('0')) {
          destination = '233' + destination.substring(1);
        } else if (destination.length === 9) {
          destination = '233' + destination;
        }
      }

      // Create payment request payload
      const paymentPayload = {
        totalAmount: airtimeDto.amount,
        description: `Airtime top-up for ${destination} (${airtimeDto.network})`,
        clientReference: airtimeDto.clientReference,
        merchantAccountNumber: process.env.HUBTEL_POS_SALES_ID,
        callbackUrl: airtimeDto.callbackUrl,
        returnUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/payment/return`,
        cancellationUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/payment/cancel`,
      };

      // Get Hubtel POS ID for payments
      const hubtelPosId = process.env.HUBTEL_POS_SALES_ID;
      if (!hubtelPosId) {
        throw new Error('HUBTEL_POS_SALES_ID environment variable is required');
      }

      this.logger.log(`Creating payment request for airtime - Amount: ${airtimeDto.amount}, Network: ${airtimeDto.network}, Destination: ${destination}`);

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
        type: 'airtime_payment_request',
        network: airtimeDto.network,
        destination: destination,
        amount: airtimeDto.amount,
        clientReference: airtimeDto.clientReference,
        response: response.data,
        status: 'pending'
      });

      return {
        success: true,
        data: {
          paymentUrl: response.data.data?.checkoutDirectUrl,
          checkoutId: response.data.data?.checkoutId,
          clientReference: airtimeDto.clientReference,
          amount: airtimeDto.amount,
          network: airtimeDto.network,
          destination: destination
        },
        message: 'Payment request created successfully. Please complete payment to receive airtime.'
      };

    } catch (error) {
      this.logger.error(`Error creating airtime payment request: ${error.message}`);
      if (error.response) {
        this.logger.error(`Hubtel response status: ${error.response.status}`);
        this.logger.error(`Hubtel response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Process airtime delivery after successful payment
   * This is called from the payment callback
   */
  async processAirtimeAfterPayment(paymentData: any): Promise<HubtelAirtimeResponseDto> {
    try {
      const { network, destination, amount, clientReference } = paymentData.metadata;

      this.logger.log(`Processing airtime delivery after payment - Network: ${network}, Destination: ${destination}, Amount: ${amount}`);

      const endpoint = this.hubtelEndpoints[network].airtime;
      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID;
      
      if (!hubtelPrepaidDepositID) {
        throw new Error('HUBTEL_PREPAID_DEPOSIT_ID environment variable is required');
      }

      const requestPayload = {
        Destination: destination,
        Amount: amount,
        CallbackUrl: `${process.env.HB_CALLBACK_URL}`,
        ClientReference: `AIRTIME_${clientReference}_${Date.now()}`
      };

      const url = `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}`;
      this.logger.log(`Delivering airtime via: ${url}`);

      const response = await axios.post(
        url,
        requestPayload,
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Basic ${process.env.HUBTEL_AUTH_TOKEN}`
          }
        }
      );

      this.logger.log(`Airtime delivery response: ${JSON.stringify(response.data)}`);

      // Log the successful airtime delivery
      await this.logTransaction({
        type: 'airtime_delivery',
        network: network,
        destination: destination,
        amount: amount,
        clientReference: requestPayload.ClientReference,
        response: response.data,
        status: 'completed'
      });

      return response.data;

    } catch (error) {
      this.logger.error(`Error processing airtime after payment: ${error.message}`);
      if (error.response) {
        this.logger.error(`Hubtel response status: ${error.response.status}`);
        this.logger.error(`Hubtel response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Handle payment callback from Hubtel
   * This processes the payment result and delivers airtime if successful
   */
  async handlePaymentCallback(callbackData: any): Promise<void> {
    try {
      this.logger.log(`Processing payment callback: ${JSON.stringify(callbackData)}`);

      const { clientReference, status, metadata } = callbackData;

      if (status === 'success' && metadata?.serviceType === 'airtime_topup') {
        // Payment successful, deliver airtime
        await this.processAirtimeAfterPayment(callbackData);
        
        this.logger.log(`Airtime delivered successfully for payment: ${clientReference}`);
      } else {
        this.logger.log(`Payment failed or not for airtime: ${clientReference}, Status: ${status}`);
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
      this.logger.error(`Error handling payment callback: ${error.message}`);
      throw error;
    }
  }

  // Legacy method - kept for backward compatibility but now redirects to payment flow
  async purchaseAirtime(airtimeDto: AirtimeTopUpDto): Promise<any> {
    this.logger.warn('Direct airtime purchase deprecated. Use createAirtimePaymentRequest instead.');
    return this.createAirtimePaymentRequest(airtimeDto);
  }

  // Legacy method - kept for backward compatibility but now redirects to payment flow
  async purchaseBundle(bundleDto: BundlePurchaseDto): Promise<any> {
    this.logger.warn('Bundle purchase should use BundleService. This method is deprecated.');
    throw new Error('Please use /bundle/payment-request endpoint for bundle purchases');
  }

  async handleAirtimeCallback(callbackData: AirtimeCallbackDto): Promise<void> {
    try {
      // Update transaction status based on callback
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

      this.logger.log(`Airtime callback processed for ${callbackData.ClientReference}`);
    } catch (error) {
      this.logger.error(`Error processing airtime callback: ${error.message}`);
      throw error;
    }
  }

  getBundlePrice(bundleType: BundleType, network: NetworkProvider): number {
    return this.bundlePrices[bundleType][network];
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
          network: transactionData.network,
          bundleType: transactionData.bundleType,
          quantity: transactionData.quantity,
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
