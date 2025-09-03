import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import {
  BundleQueryDto,
  BundlePurchaseDto,
  BundlePurchaseRequestDto,
  NetworkProvider,
  BundleType,
  BundleQueryResponse,
  BundleOption
} from '../models/dto/bundle.dto';
import { Transactions } from '../models/schemas/transaction.schema';
import { TransactionStatusService } from './transaction-status.service';

@Injectable()
export class BundleService {
  private readonly logger = new Logger(BundleService.name);

  constructor(
    @InjectModel(Transactions.name) private readonly transactionModel: Model<Transactions>,
    private readonly transactionStatusService: TransactionStatusService,
  ) { }

  // Hubtel API endpoints for different networks and services
  private readonly hubtelEndpoints: Record<NetworkProvider, Record<string, string>> = {
    [NetworkProvider.MTN]: {
      data: 'b230733cd56b4a0fad820e39f66bc27c',
      fibre: '39fbe120e9b542899eb7dad526fb04b9'
    },
    [NetworkProvider.TELECEL]: {
      data: 'fa27127ba039455da04a2ac8a1613e00',
      broadband: 'b9a1aa246ba748f9ba01ca4cdbb3d1d3'
    },
    [NetworkProvider.AT]: {
      data: '06abd92da459428496967612463575ca'
    }
  };

  /**
   * Create a payment request for bundle purchase
   * This follows the payment-first approach like USSD flow
   */
  async createBundlePaymentRequest(bundleDto: BundlePurchaseDto): Promise<any> {
    try {
      const { network, bundleType = 'data' } = bundleDto;

      // Determine the correct endpoint based on network and bundle type
      const endpoint = this.getEndpointForBundleType(network, bundleType);

      if (!endpoint) {
        throw new Error(`Bundle type '${bundleType}' not supported for network '${network}'`);
      }

      // Validate and convert mobile number format if needed
      let destination = bundleDto.destination;
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
        totalAmount: bundleDto.amount,
        description: `Data bundle for ${destination} (${network})`,
        clientReference: bundleDto.clientReference,
        merchantAccountNumber: process.env.HUBTEL_POS_SALES_ID,
        callbackUrl: bundleDto.callbackUrl,
        returnUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/payment/return`,
        cancellationUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/payment/cancel`,
      };

      // Get Hubtel POS ID for payments
      const hubtelPosId = process.env.HUBTEL_POS_SALES_ID;
      if (!hubtelPosId) {
        throw new Error('HUBTEL_POS_SALES_ID environment variable is required');
      }

      this.logger.log(`Creating payment request for bundle - Amount: ${bundleDto.amount}, Network: ${network}, Destination: ${destination}`);
      this.logger.log(`Using Hubtel POS ID: ${hubtelPosId}`);

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
        type: 'bundle_payment_request',
        network: network,
        destination: destination,
        bundleType: bundleType,
        bundleValue: bundleDto.bundleValue,
        amount: bundleDto.amount,
        clientReference: bundleDto.clientReference,
        response: response.data,
        status: 'pending'
      });

      return {
        success: true,
        data: {
          paymentUrl: response.data.data?.checkoutDirectUrl,
          checkoutId: response.data.data?.checkoutId,
          clientReference: bundleDto.clientReference,
          amount: bundleDto.amount,
          network: network,
          destination: destination,
          bundleType: bundleType,
          bundleValue: bundleDto.bundleValue
        },
        message: 'Payment request created successfully. Please complete payment to receive bundle.'
      };

    } catch (error) {
      this.logger.error(`Error creating bundle payment request: ${error.message}`);
      if (error.response) {
        this.logger.error(`Hubtel response status: ${error.response.status}`);
        this.logger.error(`Hubtel response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Process bundle delivery after successful payment
   * This is called from the payment callback
   */
  async processBundleAfterPayment(paymentData: any): Promise<any> {
    try {
      const { network, destination, bundleType, bundleValue, amount, clientReference } = paymentData.metadata;

      this.logger.log(`Processing bundle delivery after payment - Network: ${network}, Destination: ${destination}, Bundle: ${bundleValue}`);

      const endpoint = this.getEndpointForBundleType(network, bundleType);
      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID;

      if (!hubtelPrepaidDepositID) {
        throw new Error('HUBTEL_PREPAID_DEPOSIT_ID environment variable is required');
      }

      const requestPayload: BundlePurchaseRequestDto = {
        Destination: destination,
        Amount: amount,
        CallbackUrl: `${process.env.HB_CALLBACK_URL}`,
        ClientReference: `BUNDLE_${clientReference}_${Date.now()}`,
        Extradata: {
          bundle: bundleValue
        }
      };

      const url = `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}`;
      this.logger.log(`Delivering bundle via: ${url}`);

      const response = await axios.post(url, requestPayload, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Basic ${process.env.HUBTEL_AUTH_TOKEN}`
        }
      });

      this.logger.log(`Bundle delivery response: ${JSON.stringify(response.data)}`);

      // Log the successful bundle delivery
      await this.logTransaction({
        type: 'bundle_delivery',
        network: network,
        destination: destination,
        bundleType: bundleType,
        bundleValue: bundleValue,
        amount: amount,
        clientReference: requestPayload.ClientReference,
        response: response.data,
        status: 'completed'
      });

      return response.data;

    } catch (error) {
      this.logger.error(`Error processing bundle after payment: ${error.message}`);
      if (error.response) {
        this.logger.error(`Hubtel response status: ${error.response.status}`);
        this.logger.error(`Hubtel response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Handle payment callback from Hubtel
   * This processes the payment result and delivers bundle if successful
   */
  async handlePaymentCallback(callbackData: any): Promise<void> {
    try {
      this.logger.log(`Processing bundle payment callback: ${JSON.stringify(callbackData)}`);

      const { clientReference, status, metadata } = callbackData;

      if (status === 'success' && metadata?.serviceType === 'bundle_purchase') {
        // Payment successful, deliver bundle
        await this.processBundleAfterPayment(callbackData);

        this.logger.log(`Bundle delivered successfully for payment: ${clientReference}`);
      } else {
        this.logger.log(`Payment failed or not for bundle: ${clientReference}, Status: ${status}`);
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
      this.logger.error(`Error handling bundle payment callback: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get available bundles for a specific network and destination
   * This method requires a valid mobile number to get actual bundle data from the API
   */
  async getAvailableBundles(network: NetworkProvider, destination: string, bundleType: string = 'data'): Promise<BundleOption[]> {
    try {
      const bundleResponse = await this.queryBundles({
        destination: destination,
        network: network,
        bundleType: bundleType
      });

      if (bundleResponse.ResponseCode !== '0000') {
        this.logger.error(`Failed to fetch bundles for ${network}: ${bundleResponse.Message}`);
        return [];
      }

      return bundleResponse.Data || [];
    } catch (error) {
      this.logger.error(`Error fetching bundles for ${network}: ${error.message}`);
      return [];
    }
  }

  async queryBundles(bundleQueryDto: BundleQueryDto): Promise<BundleQueryResponse> {
    try {
      const { network, destination, bundleType = 'data' } = bundleQueryDto;

      // Determine the correct endpoint based on network and bundle type
      const endpoint = this.getEndpointForBundleType(network, bundleType);

      if (!endpoint) {
        throw new Error(`Bundle type '${bundleType}' not supported for network '${network}'`);
      }

      const hubtelPrepaidDepositID = process.env.HUBTEL_PREPAID_DEPOSIT_ID;

      if (!hubtelPrepaidDepositID) {
        throw new Error('HUBTEL_PREPAID_DEPOSIT_ID environment variable is required');
      }

      const url = `https://cs.hubtel.com/commissionservices/${hubtelPrepaidDepositID}/${endpoint}?destination=${destination}`;

      this.logger.log(`Querying bundles from: ${url}`);

      const response = await axios.get(url, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Basic ${process.env.HUBTEL_AUTH_TOKEN}`
        }
      });

      // Log the query
      await this.logTransaction({
        type: 'bundle_query',
        network: network,
        destination: destination,
        bundleType: bundleType,
        response: response.data
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error querying bundles: ${error.message}`);
      throw error;
    }
  }

  // Legacy method - kept for backward compatibility but now redirects to payment flow
  async purchaseBundle(bundleDto: BundlePurchaseDto): Promise<any> {
    this.logger.warn('Direct bundle purchase deprecated. Use createBundlePaymentRequest instead.');
    return this.createBundlePaymentRequest(bundleDto);
  }

  async handleBundleCallback(callbackData: any): Promise<void> {
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

      this.logger.log(`Bundle callback processed for ${callbackData.ClientReference}`);
    } catch (error) {
      this.logger.error(`Error processing bundle callback: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get the appropriate endpoint for a given network and bundle type
   */
  private getEndpointForBundleType(network: NetworkProvider, bundleType: string): string | null {
    const networkEndpoints = this.hubtelEndpoints[network];

    if (!networkEndpoints) {
      return null;
    }

    switch (bundleType.toLowerCase()) {
      case 'data':
        return networkEndpoints.data;
      case 'fibre':
      case 'fibre_broadband':
        return networkEndpoints.fibre || null;
      case 'broadband':
        return networkEndpoints.broadband || null;
      default:
        return networkEndpoints.data; // Default to data bundles
    }
  }

  // Helper method to paginate bundle options for USSD
  paginateBundles(bundles: BundleOption[], page: number = 1, itemsPerPage: number = 4): {
    items: BundleOption[];
    currentPage: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
    totalItems: number;
  } {
    // If itemsPerPage is 0 or negative, show all items
    if (itemsPerPage <= 0) {
      return {
        items: bundles,
        currentPage: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
        totalItems: bundles.length
      };
    }

    const totalPages = Math.ceil(bundles.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const items = bundles.slice(startIndex, endIndex);

    return {
      items,
      currentPage: page,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
      totalItems: bundles.length
    };
  }

  // Helper method to format bundle display for USSD
  formatBundleDisplay(bundle: BundleOption, index: number): string {
    return `${index + 1}. ${bundle.Display} - GHS ${bundle.Amount.toFixed(2)}`;
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
          bundleValue: transactionData.bundleValue,
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

  /**
   * Check transaction status for bundle purchases
   */
  async checkBundleTransactionStatus(clientReference: string): Promise<any> {
    try {
      const statusResponse = await this.transactionStatusService.checkStatusByClientReference(clientReference);
      const summary = this.transactionStatusService.getTransactionStatusSummary(statusResponse);

      return {
        success: true,
        data: statusResponse,
        summary: summary,
        isSuccessful: this.transactionStatusService.isTransactionSuccessful(statusResponse),
        shouldRetry: this.transactionStatusService.shouldRetryTransaction(statusResponse),
        formattedDetails: this.transactionStatusService.getFormattedTransactionDetails(statusResponse)
      };
    } catch (error) {
      this.logger.error(`Error checking bundle transaction status: ${error.message}`);
      return {
        success: false,
        message: error.message || 'Failed to check transaction status',
        shouldRetry: true
      };
    }
  }

  /**
   * Handle pending bundle transaction status checks
   */
  async handlePendingBundleTransactions(): Promise<void> {
    try {
      const pendingTransactions = await this.transactionModel.find({
        type: 'bundle_purchase',
        Status: { $in: ['pending', 'processing'] },
        OrderDate: { $lt: new Date(Date.now() - 5 * 60 * 1000) } // 5 minutes ago
      }).exec();

      this.logger.log(`Found ${pendingTransactions.length} pending bundle transactions to check`);

      for (const transaction of pendingTransactions) {
        try {
          if (transaction.OrderId) {
            await this.checkBundleTransactionStatus(transaction.OrderId);
            this.logger.log(`Checked status for bundle transaction: ${transaction.OrderId}`);
          }
        } catch (error) {
          this.logger.error(`Error checking status for bundle transaction ${transaction.OrderId}: ${error.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error in pending bundle transaction check: ${error.message}`);
    }
  }
}
