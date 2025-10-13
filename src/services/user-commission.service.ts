import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, CommissionTransaction } from '../models/schemas/user.shema';
import { Transactions } from '../models/schemas/transaction.schema';
import { CommissionTransactionLog } from '../models/schemas/commission-transaction-log.schema';
import { CommissionServiceCallback } from '../models/dto/commission-transaction-log.dto';
import { SendMoneyService } from './send-money.service';

@Injectable()
export class UserCommissionService {
  private readonly logger = new Logger(UserCommissionService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Transactions.name) private readonly transactionModel: Model<Transactions>,
    @InjectModel(CommissionTransactionLog.name) private readonly commissionLogModel: Model<CommissionTransactionLog>,
    private readonly sendMoneyService: SendMoneyService,
  ) { }

  /**
   * Process commission callback and update commission log
   */
  async addCommissionEarningsToUser(callbackData: CommissionServiceCallback): Promise<void> {
    try {
      const { ResponseCode, Data } = callbackData;
      
      // Process commission regardless of response code, but log warnings for failures
      if (ResponseCode !== '0000') {
        this.logger.warn(`Commission callback failed with ResponseCode: ${ResponseCode}, Description: ${Data?.Description}`);
      }

      const { TransactionId, ClientReference, Amount, Meta } = Data;
      const commissionAmount = Meta?.Commission ? parseFloat(Meta.Commission) : 0;

      // Update the commission log with the actual commission amount and status
      const updatedLog = await this.commissionLogModel.findOneAndUpdate(
        { clientReference: ClientReference },
        {
          $set: {
            commission: commissionAmount,
            status: ResponseCode === '0000' ? 'Paid' : 'Failed',
            commissionServiceDate: new Date(),
            updatedAt: new Date()
          }
        },
        { new: true }
      );

      if (!updatedLog) {
        this.logger.error(`Could not find commission log for clientReference ${ClientReference}`);
        return;
      }
      
      this.logger.log(`Updated commission log for ${ClientReference}: Commission = ${commissionAmount}, Status = ${ResponseCode === '0000' ? 'Paid' : 'Failed'}`);
    } catch (error) {
      this.logger.error(`Error processing commission callback: ${error.message}`);
    }
  }

  /**
   * Get user earnings by mobile number
   */
  async getUserEarnings(mobileNumber: string) {
    try {
      console.log(`Getting earnings for mobile: ${mobileNumber}`);

      const commissionLogs = await this.commissionLogModel.find({
        mobileNumber: mobileNumber,
        logStatus: 'active'
      }).exec();

      if (!commissionLogs || commissionLogs.length === 0) {
        console.log(`No commission logs found for mobile: ${mobileNumber}, returning default earnings`);
        return this.getDefaultEarnings();
      }

      console.log(`=== CALCULATING EARNINGS FOR ${mobileNumber} ===`);
      console.log(`Found ${commissionLogs.length} commission logs`);
      
      const totalEarnings = commissionLogs.reduce((sum, log) => {
        const commission = log.commission || 0;
        console.log(`Log ${log.clientReference}: Commission = ${commission}, Status = ${log.status}`);
        return sum + commission;
      }, 0);
      
      console.log(`Total earnings calculated: ${totalEarnings}`);
      console.log(`==========================================`);

      const transactionCount = commissionLogs.length;
      const availableBalance = totalEarnings;
      const totalWithdrawn = 0;
      const pendingWithdrawals = 0; 

      console.log(`Commission logs earnings for ${mobileNumber}:`, {
        totalEarnings,
        availableBalance,
        totalWithdrawn,
        pendingWithdrawals,
        transactionCount
      });

      return {
        totalEarnings,
        availableBalance,
        totalWithdrawn,
        pendingWithdrawals,
        transactionCount
      };
    } catch (error) {
      this.logger.error(`Error getting user earnings: ${error.message}`);
      return this.getDefaultEarnings();
    }
  }

  /**
   * Process withdrawal request
   */
  async processWithdrawalRequest(mobileNumber: string, amount: number) {
    try {
      // Get current earnings from commission logs
      const earnings = await this.getUserEarnings(mobileNumber);

      if (earnings.availableBalance < amount) {
        return { success: false, message: 'Insufficient balance' };
      }

      const minWithdrawalAmount = 0.3;
      if (amount < minWithdrawalAmount) {
        return { success: false, message: `Minimum withdrawal amount is GH ${minWithdrawalAmount.toFixed(2)}` };
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

      // Create withdrawal record in commission logs
      const withdrawalLog = {
        clientReference: clientReference,
        hubtelTransactionId: sendMoneyResponse.Data?.TransactionId || null,
        externalTransactionId: sendMoneyResponse.Data?.ExternalTransactionId || null,
        mobileNumber: mobileNumber,
        sessionId: `withdrawal_${Date.now()}`,
        serviceType: 'withdrawal',
        amount: amount,
        commission: -amount,
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

      await this.commissionLogModel.create(withdrawalLog);

      const newBalance = earnings.availableBalance - amount;
      
      if (sendMoneyResponse.ResponseCode === '0001') {
        this.logger.log(`Withdrawal request submitted successfully for ${mobileNumber}: GH ${amount}, TransactionId: ${sendMoneyResponse.Data.TransactionId}`);
        return { 
          success: true, 
          message: 'Withdrawal request submitted successfully. You will receive payment within 24 hours.', 
          newBalance,
          transactionId: sendMoneyResponse.Data.TransactionId
        };
      } else {
        this.logger.error(`Withdrawal failed for ${mobileNumber}: ${sendMoneyResponse.Data?.Description}`);
        return { 
          success: false, 
          message: `Withdrawal failed: ${sendMoneyResponse.Data?.Description || 'Unknown error'}`,
          newBalance: earnings.availableBalance // Don't deduct from balance if failed
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
      const withdrawalRecord = await this.commissionLogModel.findOne({ 
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
        
        // Refund the amount back to user's balance by creating a positive commission entry
        const refundLog = {
          clientReference: `refund_${ClientReference}`,
          hubtelTransactionId: null,
          externalTransactionId: null,
          mobileNumber: withdrawalRecord.mobileNumber,
          sessionId: `refund_${Date.now()}`,
          serviceType: 'withdrawal_refund',
          amount: withdrawalRecord.amount,
          commission: withdrawalRecord.amount, 
          charges: 0,
          amountAfterCharges: withdrawalRecord.amount,
          currencyCode: 'GHS',
          paymentMethod: 'refund',
          status: 'Completed',
          isFulfilled: true,
          responseCode: '0000',
          message: `Refund for failed withdrawal: ${Description}`,
          commissionServiceStatus: 'delivered',
          transactionDate: new Date(),
          retryCount: 0,
          isRetryable: false,
          logStatus: 'active'
        };

        await this.commissionLogModel.create(refundLog);
        
        this.logger.log(`Withdrawal failed and refunded for ${withdrawalRecord.mobileNumber}: GH ${withdrawalRecord.amount}`);
      }

      // Update the withdrawal record
      await this.commissionLogModel.findOneAndUpdate(
        { clientReference: ClientReference },
        { $set: updateData }
      );

    } catch (error) {
      this.logger.error(`Error handling send money callback: ${error.message}`);
    }
  }

  /**
   * Manually update commission for a specific transaction
   * This can be used to fix transactions that didn't get proper commission processing
   */
  async updateTransactionCommission(clientReference: string, commissionAmount: number): Promise<void> {
    try {
      const updatedLog = await this.commissionLogModel.findOneAndUpdate(
        { clientReference },
        {
          $set: {
            commission: commissionAmount,
            updatedAt: new Date()
          }
        },
        { new: true }
      );

      if (!updatedLog) {
        this.logger.error(`Could not find commission log for clientReference ${clientReference}`);
        return;
      }
      
      this.logger.log(`Manually updated commission for ${clientReference}: ${commissionAmount}`);
    } catch (error) {
      this.logger.error(`Error updating commission for ${clientReference}: ${error.message}`);
    }
  }

  /**
   * Get user transaction history from commission logs
   */
  async getUserTransactionHistory(mobileNumber: string, limit: number = 20): Promise<any[]> {
    try {
      const commissionLogs = await this.commissionLogModel.find({
        mobileNumber: mobileNumber,
        logStatus: 'active'
      })
      .sort({ transactionDate: -1 })
      .limit(limit)
      .exec();

      return commissionLogs.map(log => ({
        transactionId: log.hubtelTransactionId,
        clientReference: log.clientReference,
        amount: log.amount,
        commission: log.commission || 0,
        serviceType: log.serviceType,
        transactionDate: log.transactionDate,
        status: log.status,
        charges: log.charges || 0,
        amountAfterCharges: log.amountAfterCharges || log.amount
      }));
    } catch (error) {
      this.logger.error(`Error getting user transaction history: ${error.message}`);
      return [];
    }
  }

  /**
   * Get commission statistics
   */
  async getCommissionStatistics() {
    try {
      const totalUsers = await this.userModel.countDocuments();

      const stats = await this.userModel.aggregate([
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: '$totalEarnings' },
            totalWithdrawn: { $sum: '$totalWithdrawn' },
            pendingWithdrawals: { $sum: '$pendingWithdrawals' },
            averageEarnings: { $avg: '$totalEarnings' }
          }
        }
      ]);

      const result = stats[0] || this.getDefaultStats();
      return {
        totalUsers,
        totalEarnings: result.totalEarnings,
        totalWithdrawn: result.totalWithdrawn,
        pendingWithdrawals: result.pendingWithdrawals,
        averageEarningsPerUser: result.averageEarnings
      };
    } catch (error) {
      this.logger.error(`Error getting commission statistics: ${error.message}`);
      return this.getDefaultStats();
    }
  }


  private getDefaultEarnings() {
    return {
      totalEarnings: 0,
      availableBalance: 0,
      totalWithdrawn: 0,
      pendingWithdrawals: 0,
      transactionCount: 0
    };
  }

  private getDefaultStats() {
    return {
      totalUsers: 0,
      totalEarnings: 0,
      totalWithdrawn: 0,
      pendingWithdrawals: 0,
      averageEarnings: 0
    };
  }
}