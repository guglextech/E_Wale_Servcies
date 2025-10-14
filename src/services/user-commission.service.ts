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
      let pendingWithdrawals = 0;

      logs.forEach(log => {
        const commission = log.commission || 0;
        
        switch (log.serviceType) {
          case 'withdrawal_deduction':
            totalWithdrawn += Math.abs(commission);
            break;
          case 'pending_withdrawal':
            pendingWithdrawals += log.amount;
            break;
          default:
            totalEarnings += commission;
        }
      });

      return {
        totalEarnings,
        availableBalance: totalEarnings - totalWithdrawn - pendingWithdrawals,
        totalWithdrawn,
        pendingWithdrawals,
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
      
      if (result.success) {
        await this.createPendingWithdrawal(mobileNumber, amount, result.transactionId);
        return { ...result, newBalance: earnings.availableBalance };
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
      const { ClientReference, TransactionId } = Data;

      await this.withdrawalService.handleSendMoneyCallback(callbackData);

      const withdrawalRecord = await this.withdrawalService.getWithdrawalByClientReference(ClientReference);
      if (!withdrawalRecord) return;

      const { mobileNumber, amount } = withdrawalRecord;

      if (ResponseCode === '0000') {
        // Success: Deduct balance and remove pending record
        await this.createWithdrawalDeduction(mobileNumber, amount, TransactionId);
        await this.removePendingWithdrawal(mobileNumber, TransactionId);
        this.logger.log(`Withdrawal completed: ${mobileNumber} - GH ${amount}`);
      } else {
        // Failed: Remove pending record only
        await this.removePendingWithdrawal(mobileNumber, TransactionId, 'Failed');
        this.logger.log(`Withdrawal failed: ${mobileNumber} - GH ${amount}`);
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

  // Private helper methods
  private async createPendingWithdrawal(mobileNumber: string, amount: number, transactionId?: string): Promise<void> {
    await this.commissionLogModel.create({
      clientReference: `pending_withdrawal_${mobileNumber}_${Date.now()}`,
      hubtelTransactionId: transactionId,
      mobileNumber,
      serviceType: 'pending_withdrawal',
      amount,
      commission: 0,
      status: 'Pending',
      responseCode: '0001',
      message: `Pending withdrawal for ${mobileNumber}`,
      transactionDate: new Date(),
      logStatus: 'active'
    });
  }

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

  private async removePendingWithdrawal(mobileNumber: string, transactionId: string, status?: string): Promise<void> {
    const updateData: any = { logStatus: 'inactive' };
    if (status) updateData.status = status;

    await this.commissionLogModel.findOneAndUpdate(
      { 
        mobileNumber,
        serviceType: 'pending_withdrawal',
        hubtelTransactionId: transactionId
      },
      { $set: updateData }
    );
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