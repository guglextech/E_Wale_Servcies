import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Withdrawal, WithdrawalDocument } from '../models/schemas/withdrawal.schema';
import { SendMoneyService } from './send-money.service';

@Injectable()
export class WithdrawalService {
  private readonly logger = new Logger(WithdrawalService.name);

  constructor(
    @InjectModel(Withdrawal.name) private readonly withdrawalModel: Model<WithdrawalDocument>,
    private readonly sendMoneyService: SendMoneyService,
  ) {}

  /**
   * Process withdrawal request
   */
  async processWithdrawalRequest(mobileNumber: string, amount: number) {
    try {
      if (amount < 0.5) {
        return { success: false, message: 'Minimum withdrawal amount is GH 0.50' };
      }

      const clientReference = `withdrawal_${mobileNumber}_${Date.now()}`;
      const formattedPhoneNumber = this.sendMoneyService.formatPhoneNumber(mobileNumber);
      const channel = this.sendMoneyService.determineChannel(formattedPhoneNumber);
      const callbackUrl = process.env.HB_CALLBACK_URL;

      // Send money via Hubtel API
      const sendMoneyRequest = {
        recipientName: mobileNumber,
        recipientMsisdn: formattedPhoneNumber,
        channel: channel,
        amount: amount,
        primaryCallbackUrl: callbackUrl,
        description: `Commission withdrawal for ${mobileNumber}`,
        clientReference: clientReference
      };

      this.logger.log(`Processing withdrawal via Hubtel Send Money API: ${JSON.stringify(sendMoneyRequest)}`);

      const sendMoneyResponse = await this.sendMoneyService.sendMoney(sendMoneyRequest);

      // Create withdrawal record
      const withdrawalRecord = {
        clientReference: clientReference,
        hubtelTransactionId: sendMoneyResponse.Data?.TransactionId || null,
        externalTransactionId: sendMoneyResponse.Data?.ExternalTransactionId || null,
        mobileNumber: mobileNumber,
        amount: amount,
        charges: sendMoneyResponse.Data?.Charges || 0,
        amountAfterCharges: amount,
        currencyCode: 'GHS',
        paymentMethod: 'mobile_money',
        status: sendMoneyResponse.ResponseCode === '0001' ? 'Pending' : 'Failed',
        isFulfilled: sendMoneyResponse.ResponseCode === '0000',
        responseCode: sendMoneyResponse.ResponseCode,
        message: sendMoneyResponse.Data?.Description || 'Withdrawal processed',
        commissionServiceStatus: sendMoneyResponse.ResponseCode === '0001' ? 'pending' : 'failed',
        transactionDate: new Date(),
        retryCount: 0,
        isRetryable: sendMoneyResponse.ResponseCode === '0001',
        logStatus: 'active'
      };

      await this.withdrawalModel.create(withdrawalRecord);

      if (sendMoneyResponse.ResponseCode === '0001') {
        this.logger.log(`Withdrawal request submitted successfully for ${mobileNumber}: GH ${amount}, TransactionId: ${sendMoneyResponse.Data.TransactionId}`);
        return { 
          success: true, 
          message: 'Withdrawal request submitted successfully. You will receive payment within 24 hours.', 
          transactionId: sendMoneyResponse.Data.TransactionId
        };
      } else {
        this.logger.error(`Withdrawal failed for ${mobileNumber}: ${sendMoneyResponse.Data?.Description}`);
        return { 
          success: false, 
          message: `Withdrawal failed: ${sendMoneyResponse.Data?.Description || 'Unknown error'}`
        };
      }
    } catch (error) {
      this.logger.error(`Error processing withdrawal: ${error.message}`);
      return { success: false, message: `Withdrawal processing failed: ${error.message}` };
    }
  }

  /**
   * Handle send money callback from Hubtel
   */
  async handleSendMoneyCallback(callbackData: any): Promise<void> {
    try {
      const { ResponseCode, Data } = callbackData;
      const { ClientReference, TransactionId, ExternalTransactionId, Description } = Data;

      this.logger.log(`Processing send money callback for client reference: ${ClientReference}`);

      // Find the withdrawal record
      const withdrawalRecord = await this.withdrawalModel.findOne({ 
        clientReference: ClientReference 
      });

      if (!withdrawalRecord) {
        this.logger.error(`Withdrawal record not found for client reference: ${ClientReference}`);
        return;
      }

      // Update withdrawal status based on response code
      const updateData: any = {
        hubtelTransactionId: TransactionId,
        externalTransactionId: ExternalTransactionId,
        message: Description,
        responseCode: ResponseCode
      };

      if (ResponseCode === '0000') {
        // Successful withdrawal
        updateData.status = 'Completed';
        updateData.isFulfilled = true;
        updateData.commissionServiceStatus = 'delivered';
        updateData.isRetryable = false;
        
        this.logger.log(`Withdrawal completed successfully for ${withdrawalRecord.mobileNumber}: GH ${withdrawalRecord.amount}`);
      } else {
        // Failed withdrawal
        updateData.status = 'Failed';
        updateData.isFulfilled = false;
        updateData.commissionServiceStatus = 'failed';
        updateData.isRetryable = true;
        
        this.logger.log(`Withdrawal failed for ${withdrawalRecord.mobileNumber}: GH ${withdrawalRecord.amount}`);
      }

      // Update the withdrawal record
      await this.withdrawalModel.findOneAndUpdate(
        { clientReference: ClientReference },
        { $set: updateData }
      );

    } catch (error) {
      this.logger.error(`Error handling send money callback: ${error.message}`);
    }
  }

  /**
   * Get withdrawal by client reference
   */
  async getWithdrawalByClientReference(clientReference: string): Promise<any> {
    try {
      const withdrawal = await this.withdrawalModel.findOne({
        clientReference: clientReference
      }).exec();

      return withdrawal;
    } catch (error) {
      this.logger.error(`Error getting withdrawal by client reference: ${error.message}`);
      return null;
    }
  }

  /**
   * Get user withdrawal history
   */
  async getUserWithdrawalHistory(mobileNumber: string, limit: number = 20): Promise<any[]> {
    try {
      const withdrawals = await this.withdrawalModel.find({
        mobileNumber: mobileNumber,
        logStatus: 'active'
      })
      .sort({ transactionDate: -1 })
      .limit(limit)
      .exec();

      return withdrawals.map(withdrawal => ({
        transactionId: withdrawal.hubtelTransactionId,
        clientReference: withdrawal.clientReference,
        amount: withdrawal.amount,
        status: withdrawal.status,
        charges: withdrawal.charges || 0,
        amountAfterCharges: withdrawal.amountAfterCharges || withdrawal.amount,
        transactionDate: withdrawal.transactionDate,
        message: withdrawal.message
      }));
    } catch (error) {
      this.logger.error(`Error getting user withdrawal history: ${error.message}`);
      return [];
    }
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
              $sum: {
                $cond: [{ $eq: ['$status', 'Completed'] }, '$amount', 0]
              }
            },
            failedWithdrawals: {
              $sum: {
                $cond: [{ $eq: ['$status', 'Failed'] }, '$amount', 0]
              }
            },
            pendingWithdrawals: {
              $sum: {
                $cond: [{ $eq: ['$status', 'Pending'] }, '$amount', 0]
              }
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
      this.logger.error(`Error getting withdrawal statistics: ${error.message}`);
      return this.getDefaultStats();
    }
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
}
