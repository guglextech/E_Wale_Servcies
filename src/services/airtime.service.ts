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
      data: 'fdd76c884e614b1c8f669a3207b09a98', // Same endpoint for now
      voice: 'fdd76c884e614b1c8f669a3207b09a98' // Same endpoint for now
    },
    [NetworkProvider.TELECEL]: {
      airtime: 'f4be83ad74c742e185224fdae1304800',
      data: 'f4be83ad74c742e185224fdae1304800', // Same endpoint for now
      voice: 'f4be83ad74c742e185224fdae1304800' // Same endpoint for now
    },
    [NetworkProvider.AT]: {
      airtime: 'dae2142eb5a14c298eace60240c09e4b',
      data: 'dae2142eb5a14c298eace60240c09e4b', // Same endpoint for now
      voice: 'dae2142eb5a14c298eace60240c09e4b' // Same endpoint for now
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
      if (airtimeDto.amount % 0.01 !== 0) {
        throw new Error('Amount must have maximum 2 decimal places');
      }

      const endpoint = this.hubtelEndpoints[airtimeDto.network].airtime;
      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID || '	2023298';

      const requestPayload = {
        Destination: airtimeDto.destination,
        Amount: airtimeDto.amount,
        CallbackUrl: airtimeDto.callbackUrl,
        ClientReference: airtimeDto.clientReference
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
      throw error;
    }
  }

  async purchaseBundle(bundleDto: BundlePurchaseDto): Promise<HubtelAirtimeResponseDto> {
    try {
      const endpoint = this.hubtelEndpoints[bundleDto.network][bundleDto.bundleType.toLowerCase()];
      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID || '11691';

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
