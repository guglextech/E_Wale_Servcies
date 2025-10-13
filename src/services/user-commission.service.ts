import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, CommissionTransaction } from '../models/schemas/user.shema';
import { Transactions } from '../models/schemas/transaction.schema';
import { CommissionTransactionLog } from '../models/schemas/commission-transaction-log.schema';
import { CommissionServiceCallback } from '../models/dto/commission-transaction-log.dto';
import { WithdrawalService } from './withdrawal.service';

@Injectable()
export class UserCommissionService {
  private readonly logger = new Logger(UserCommissionService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Transactions.name) private readonly transactionModel: Model<Transactions>,
    @InjectModel(CommissionTransactionLog.name) private readonly commissionLogModel: Model<CommissionTransactionLog>,
    private readonly withdrawalService: WithdrawalService,
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

      // Delegate to withdrawal service
      const result = await this.withdrawalService.processWithdrawalRequest(mobileNumber, amount);
      
      if (result.success) {
        const newBalance = earnings.availableBalance - amount;
        return { 
          ...result, 
          newBalance 
        };
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Error processing withdrawal: ${error.message}`);
      return { success: false, message: `Withdrawal processing failed: ${error.message}` };
    }
  }

  /**
   * Handle send money callback from Hubtel
   */
  async handleSendMoneyCallback(callbackData: any): Promise<void> {
    // Delegate to withdrawal service
    await this.withdrawalService.handleSendMoneyCallback(callbackData);
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