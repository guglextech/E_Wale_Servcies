import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Withdrawal, WithdrawalDocument } from '../models/schemas/withdrawal.schema';
import { CommissionTransactionLog, CommissionTransactionLogDocument } from '../models/schemas/commission-transaction-log.schema';
import { SendMoneyService } from './send-money.service';
import * as process from "process";

@Injectable()
export class WithdrawalService {
  private readonly logger = new Logger(WithdrawalService.name);
  public readonly MIN_WITHDRAWAL_AMOUNT = parseFloat(process.env.MIN_WITHDRAWAL_AMOUNT || '2.0');

  constructor(
    @InjectModel(Withdrawal.name) private readonly withdrawalModel: Model<WithdrawalDocument>,
    @InjectModel(CommissionTransactionLog.name) private readonly commissionLogModel: Model<CommissionTransactionLogDocument>,
    private readonly sendMoneyService: SendMoneyService,
  ) {}

  /**
   * Process withdrawal request
   */
  async processWithdrawalRequest(mobileNumber: string, amount: number, clientReference?: string) {
    try {
      if (amount < this.MIN_WITHDRAWAL_AMOUNT) {
        return { success: false, message: `Minimum withdrawal amount is GH ${this.MIN_WITHDRAWAL_AMOUNT.toFixed(2)}` };
      }

      const withdrawalClientRef = clientReference || `withdrawal_${mobileNumber}_${Date.now()}`;
      const formattedPhone = this.sendMoneyService.formatPhoneNumber(mobileNumber);
      const channel = await this.getChannelFromCommissionLogs(mobileNumber);

      const sendMoneyRequest = {
        recipientName: mobileNumber,
        recipientMsisdn: formattedPhone,
        channel,
        amount,
        primaryCallbackUrl: process.env.HB_CALLBACK_URL,
        description: `Commission withdrawal for ${mobileNumber}`,
        clientReference: withdrawalClientRef
      };

      const response = await this.sendMoneyService.sendMoney(sendMoneyRequest);
      
      // Create withdrawal record
      await this.createWithdrawalRecord(withdrawalClientRef, mobileNumber, amount, response);

      if (response.ResponseCode === '0001') {
        this.logger.log(`Withdrawal submitted: ${mobileNumber} - GH ${amount}`);
        return { 
          success: true, 
          message: 'Withdrawal request submitted successfully. You will receive payment within 24 hours.', 
          transactionId: response.Data.TransactionId,
          clientReference: withdrawalClientRef
        };
      } else {
        this.logger.error(`Withdrawal failed: ${mobileNumber} - ${response.Data?.Description}`);
        return { 
          success: false, 
          message: `Withdrawal failed: ${response.Data?.Description || 'Unknown error'}`
        };
      }
    } catch (error) {
      this.logger.error(`Error processing withdrawal: ${error.message}`);
      return { success: false, message: `Withdrawal processing failed here: ${error.message}` };
    }
  }

  /**
   * Handle send money callback from Hubtel
   */
  async handleSendMoneyCallback(callbackData: any): Promise<void> {
    try {
      const { ResponseCode, Data } = callbackData;
      const { ClientReference, TransactionId, ExternalTransactionId, Description } = Data;

      const withdrawal = await this.withdrawalModel.findOne({ clientReference: ClientReference });
      if (!withdrawal) {
        this.logger.error(`Withdrawal not found: ${ClientReference}`);
        return;
      }

      const updateData = {
        hubtelTransactionId: TransactionId,
        externalTransactionId: ExternalTransactionId,
        message: Description,
        responseCode: ResponseCode,
        status: ResponseCode === '0000' ? 'Completed' : 'Failed',
        isFulfilled: ResponseCode === '0000',
        commissionServiceStatus: ResponseCode === '0000' ? 'delivered' : 'failed',
        isRetryable: ResponseCode !== '0000'
      };

      await this.withdrawalModel.findOneAndUpdate(
        { clientReference: ClientReference },
        { $set: updateData }
      );

      this.logger.log(`Withdrawal ${ResponseCode === '0000' ? 'completed' : 'failed'}: ${withdrawal.mobileNumber} - GH ${withdrawal.amount}`);
    } catch (error) {
      this.logger.error(`Error handling callback: ${error.message}`);
    }
  }

  /**
   * Get withdrawal by client reference
   */
  async getWithdrawalByClientReference(clientReference: string): Promise<any> {
    try {
      return await this.withdrawalModel.findOne({ clientReference }).exec();
    } catch (error) {
      this.logger.error(`Error getting withdrawal: ${error.message}`);
      return null;
    }
  }

  /**
   * Get user withdrawal history
   */
  async getUserWithdrawalHistory(mobileNumber: string, limit: number = 20): Promise<any[]> {
    try {
      const withdrawals = await this.withdrawalModel.find({
        mobileNumber,
        logStatus: 'active'
      })
      .sort({ transactionDate: -1 })
      .limit(limit);

      return withdrawals.map(w => ({
        transactionId: w.hubtelTransactionId,
        clientReference: w.clientReference,
        amount: w.amount,
        status: w.status,
        charges: w.charges || 0,
        amountAfterCharges: w.amountAfterCharges || w.amount,
        transactionDate: w.transactionDate,
        message: w.message
      }));
    } catch (error) {
      this.logger.error(`Error getting withdrawal history: ${error.message}`);
      return [];
    }
  }

  /**
   * Get minimum withdrawal amount
   */
  getMinWithdrawalAmount(): number {
    return this.MIN_WITHDRAWAL_AMOUNT;
  }

  /**
   * Get withdrawal statistics
   */
  async getWithdrawalStatistics() {
    try {
      const stats = await this.withdrawalModel.aggregate([
        {
          $group: {
            _id: null,
            totalWithdrawals: { $sum: '$amount' },
            totalCharges: { $sum: '$charges' },
            completedWithdrawals: {
              $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, '$amount', 0] }
            },
            failedWithdrawals: {
              $sum: { $cond: [{ $eq: ['$status', 'Failed'] }, '$amount', 0] }
            },
            pendingWithdrawals: {
              $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, '$amount', 0] }
            }
          }
        }
      ]);

      const result = stats[0] || this.getDefaultStats();
      return {
        totalWithdrawals: result.totalWithdrawals,
        totalCharges: result.totalCharges,
        completedWithdrawals: result.completedWithdrawals,
        failedWithdrawals: result.failedWithdrawals,
        pendingWithdrawals: result.pendingWithdrawals
      };
    } catch (error) {
      this.logger.error(`Error getting statistics: ${error.message}`);
      return this.getDefaultStats();
    }
  }

  // Private helper methods
  private async createWithdrawalRecord(clientReference: string, mobileNumber: string, amount: number, response: any): Promise<void> {
    await this.withdrawalModel.create({
      clientReference,
      hubtelTransactionId: response.Data?.TransactionId || null,
      externalTransactionId: response.Data?.ExternalTransactionId || null,
      mobileNumber,
      amount,
      charges: response.Data?.Charges || 0,
      amountAfterCharges: amount,
      currencyCode: 'GHS',
      paymentMethod: 'mobile_money',
      status: response.ResponseCode === '0001' ? 'Pending' : 'Failed',
      isFulfilled: response.ResponseCode === '0000',
      responseCode: response.ResponseCode,
      message: response.Data?.Description || 'Withdrawal processed',
      commissionServiceStatus: response.ResponseCode === '0001' ? 'pending' : 'failed',
      transactionDate: new Date(),
      retryCount: 0,
      isRetryable: response.ResponseCode === '0001',
      logStatus: 'active'
    });
  }

  private getDefaultStats() {
    return {
      totalWithdrawals: 0,
      totalCharges: 0,
      completedWithdrawals: 0,
      failedWithdrawals: 0,
      pendingWithdrawals: 0
    };
  }


  /**
   * Get channel from commission logs - Simple and clean
   */
  private async getChannelFromCommissionLogs(mobileNumber: string): Promise<'mtn-gh' | 'vodafone-gh' | 'tigo-gh'> {
    try {
      const recentLog = await this.commissionLogModel.findOne({
        mobileNumber,
        logStatus: 'active',
        network: { $exists: true, $ne: null }
      })
      .sort({ createdAt: -1 })
      .exec();

      if (recentLog?.network) {
        const network = recentLog.network.toUpperCase();
        
        if (network === 'MTN') return 'mtn-gh';
        if (network === 'TELECEL GHANA') return 'vodafone-gh';
        if (network === 'AT') return 'tigo-gh';
      }

      // Default to MTN
      return 'mtn-gh';
    } catch (error) {
      this.logger.error(`Error getting channel: ${error.message}`);
      return 'mtn-gh';
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