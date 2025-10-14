import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../models/schemas/user.shema';
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
  ) {}

  /**
   * Process commission callback and update commission log
   */
  async addCommissionEarningsToUser(callbackData: CommissionServiceCallback): Promise<void> {
    try {
      const { ResponseCode, Data } = callbackData;
      const { ClientReference, Meta } = Data;
      const commissionAmount = Meta?.Commission ? parseFloat(Meta.Commission) : 0;

      await this.commissionLogModel.findOneAndUpdate(
        { clientReference: ClientReference },
        {
          $set: {
            commission: commissionAmount,
            status: ResponseCode === '0000' ? 'Paid' : 'Failed',
            commissionServiceDate: new Date(),
            updatedAt: new Date()
          }
        }
      );

      this.logger.log(`Updated commission for ${ClientReference}: ${commissionAmount}`);
    } catch (error) {
      this.logger.error(`Error processing commission callback: ${error.message}`);
    }
  }

  /**
   * Get user earnings by mobile number
   */
  async getUserEarnings(mobileNumber: string) {
    try {
      const logs = await this.commissionLogModel.find({
        mobileNumber,
        logStatus: 'active'
      });

      if (!logs.length) return this.getDefaultEarnings();

      let totalEarnings = 0;
      let totalWithdrawn = 0;

      logs.forEach(log => {
        const commission = log.commission || 0;
        
        if (log.serviceType === 'withdrawal_deduction') {
          totalWithdrawn += Math.abs(commission);
        } else {
          totalEarnings += commission;
        }
      });

      return {
        totalEarnings,
        availableBalance: totalEarnings - totalWithdrawn,
        totalWithdrawn,
        transactionCount: logs.length
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
      const earnings = await this.getUserEarnings(mobileNumber);

      if (earnings.availableBalance < amount) {
        return { success: false, message: 'Insufficient balance' };
      }

      const result = await this.withdrawalService.processWithdrawalRequest(mobileNumber, amount);
      console.log(result, "CHECKING RESULT");
      if (result.success) {
        // Deduct balance immediately
        await this.createWithdrawalDeduction(mobileNumber, amount, result.transactionId);
        const newBalance = earnings.availableBalance - amount;
        return { ...result, newBalance };
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
    try {
      const { ResponseCode, Data } = callbackData;
      const { ClientReference } = Data;

      await this.withdrawalService.handleSendMoneyCallback(callbackData);

      const withdrawalRecord = await this.withdrawalService.getWithdrawalByClientReference(ClientReference);
      if (!withdrawalRecord) return;

      const { mobileNumber, amount } = withdrawalRecord;

      if (ResponseCode !== '0000') {
        // Failed: Create refund to restore user balance
        await this.createWithdrawalRefund(mobileNumber, amount, ClientReference);
        this.logger.log(`Withdrawal failed, refunded: ${mobileNumber} - GH ${amount}`);
      } else {
        this.logger.log(`Withdrawal completed: ${mobileNumber} - GH ${amount}`);
      }
    } catch (error) {
      this.logger.error(`Error handling withdrawal callback: ${error.message}`);
    }
  }

  /**
   * Get user transaction history
   */
  async getUserTransactionHistory(mobileNumber: string, limit: number = 20): Promise<any[]> {
    try {
      const logs = await this.commissionLogModel.find({
        mobileNumber,
        logStatus: 'active'
      })
      .sort({ transactionDate: -1 })
      .limit(limit);

      return logs.map(log => ({
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
      this.logger.error(`Error getting transaction history: ${error.message}`);
      return [];
    }
  }

  /**
   * Update commission for a specific transaction
   */
  async updateTransactionCommission(clientReference: string, commissionAmount: number): Promise<void> {
    try {
      await this.commissionLogModel.findOneAndUpdate(
        { clientReference },
        { $set: { commission: commissionAmount, updatedAt: new Date() } }
      );
      this.logger.log(`Updated commission for ${clientReference}: ${commissionAmount}`);
    } catch (error) {
      this.logger.error(`Error updating commission: ${error.message}`);
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
            averageEarnings: { $avg: '$totalEarnings' }
          }
        }
      ]);

      const result = stats[0] || this.getDefaultStats();
      return {
        totalUsers,
        totalEarnings: result.totalEarnings,
        totalWithdrawn: result.totalWithdrawn,
        averageEarningsPerUser: result.averageEarnings
      };
    } catch (error) {
      this.logger.error(`Error getting commission statistics: ${error.message}`);
      return this.getDefaultStats();
    }
  }

  // Private helper methods

  private async createWithdrawalDeduction(mobileNumber: string, amount: number, transactionId?: string): Promise<void> {
    await this.commissionLogModel.create({
      clientReference: `withdrawal_deduction_${mobileNumber}_${Date.now()}`,
      hubtelTransactionId: transactionId,
      mobileNumber,
      serviceType: 'withdrawal_deduction',
      amount,
      commission: -amount,
      status: 'Completed',
      responseCode: '0000',
      message: `Withdrawal deduction for ${mobileNumber}`,
      transactionDate: new Date(),
      logStatus: 'active'
    });
  }

  private async createWithdrawalRefund(mobileNumber: string, amount: number, clientReference: string): Promise<void> {
    await this.commissionLogModel.create({
      clientReference: `withdrawal_refund_${clientReference}`,
      hubtelTransactionId: null,
      mobileNumber,
      serviceType: 'withdrawal_refund',
      amount,
      commission: amount, // Positive commission to restore earnings
      status: 'Completed',
      responseCode: '0000',
      message: `Withdrawal refund for failed withdrawal: ${clientReference}`,
      transactionDate: new Date(),
      logStatus: 'active'
    });
  }

  private getDefaultEarnings() {
    return {
      totalEarnings: 0,
      availableBalance: 0,
      totalWithdrawn: 0,
      transactionCount: 0
    };
  }

  private getDefaultStats() {
    return {
      totalUsers: 0,
      totalEarnings: 0,
      totalWithdrawn: 0,
      averageEarnings: 0
    };
  }
}