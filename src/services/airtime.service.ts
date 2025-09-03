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

  async purchaseAirtime(airtimeDto: AirtimeTopUpDto): Promise<HubtelAirtimeResponseDto> {
    try {
      // Validate amount (max 100 cedis)
      if (airtimeDto.amount > 100) {
        throw new Error('Maximum airtime top-up amount is 100 cedis');
      }

      // Validate amount format (2 decimal places)
      const decimalPlaces = (airtimeDto.amount.toString().split('.')[1] || '').length;
      if (decimalPlaces > 2) {
        throw new Error('Amount must have maximum 2 decimal places');
      }

      const endpoint = this.hubtelEndpoints[airtimeDto.network].airtime;
      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID;
      
      if (!hubtelPrepaidDepositID) {
        throw new Error('HUBTEL_PREPAID_DEPOSIT_ID environment variable is required');
      }

      // Debug logging
      this.logger.log(`Airtime purchase request - Network: ${airtimeDto.network}, Endpoint: ${endpoint}, DepositID: ${hubtelPrepaidDepositID}`);
      this.logger.log(`Auth token exists: ${!!process.env.HUBTEL_AUTH_TOKEN}`);

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

      const requestPayload = {
        Destination: destination,
        Amount: airtimeDto.amount,
        CallbackUrl: airtimeDto.callbackUrl,
        ClientReference: airtimeDto.clientReference
      };

      const url = `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}`;
      this.logger.log(`Making request to: ${url}`);
      this.logger.log(`Request payload: ${JSON.stringify(requestPayload)}`);

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

      this.logger.log(`Hubtel response: ${JSON.stringify(response.data)}`);

      // Log the transaction
      await this.logTransaction({
        type: 'airtime_topup',
        network: airtimeDto.network,
        destination: airtimeDto.destination,
        amount: airtimeDto.amount,
        clientReference: airtimeDto.clientReference,
        response: response.data
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error purchasing airtime: ${error.message}`);
      if (error.response) {
        this.logger.error(`Hubtel response status: ${error.response.status}`);
        this.logger.error(`Hubtel response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  async purchaseBundle(bundleDto: BundlePurchaseDto): Promise<HubtelAirtimeResponseDto> {
    try {
      // Map bundle type to endpoint key
      let endpointKey: string;
      switch (bundleDto.bundleType) {
        case BundleType.DATA:
          endpointKey = 'data';
          break;
        case BundleType.VOICE:
          endpointKey = 'voice';
          break;
        default:
          endpointKey = 'airtime';
      }
      
      const endpoint = this.hubtelEndpoints[bundleDto.network][endpointKey];
      if (!endpoint) {
        throw new Error(`Bundle type '${bundleDto.bundleType}' not supported for network '${bundleDto.network}'`);
      }
      
      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID || '2023298';

      // Calculate total amount based on bundle type and quantity
      const unitPrice = this.bundlePrices[bundleDto.bundleType][bundleDto.network];
      const totalAmount = unitPrice * bundleDto.quantity;

      const requestPayload = {
        Destination: bundleDto.destination,
        Amount: totalAmount,
        CallbackUrl: bundleDto.callbackUrl,
        ClientReference: bundleDto.clientReference,
        BundleType: bundleDto.bundleType,
        Quantity: bundleDto.quantity
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
        quantity: bundleDto.quantity,
        amount: totalAmount,
        clientReference: bundleDto.clientReference,
        response: response.data
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error purchasing bundle: ${error.message}`);
      throw error;
    }
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
        Status: transactionData.response?.ResponseCode === '0000' ? 'success' : 'pending',
        OrderDate: new Date(),
        Currency: 'GHS',
        Subtotal: transactionData.amount || 0,
        PaymentType: 'mobile_money',
        AmountPaid: transactionData.amount || 0,
        PaymentDate: new Date(),
        IsSuccessful: transactionData.response?.ResponseCode === '0000' || false,
        createdAt: new Date()
      });
      await transaction.save();
    } catch (error) {
      this.logger.error(`Error logging transaction: ${error.message}`);
    }
  }
}
