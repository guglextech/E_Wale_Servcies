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
   * Get user earnings by mobile number - Simplified approach
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
          // These are withdrawn commissions
          totalWithdrawn += commission;
        } else {
          // These are active earnings
          totalEarnings += commission;
        }
      });

      const availableBalance = Math.max(0, totalEarnings - totalWithdrawn);

      return {
        totalEarnings,
        availableBalance,
        totalWithdrawn,
        transactionCount: logs.length
      };
    } catch (error) {
      this.logger.error(`Error getting user earnings: ${error.message}`);
      return this.getDefaultEarnings();
    }
  }

  /**
   * Process withdrawal request - Simplified approach
   */
  async processWithdrawalRequest(mobileNumber: string, amount: number, clientReference?: string) {
    try {
      const earnings = await this.getUserEarnings(mobileNumber);

      if (earnings.availableBalance < this.withdrawalService.getMinWithdrawalAmount()) {
        return { success: false, message: 'Insufficient balance' };
      }

      // Withdraw ALL available earnings
      const withdrawalAmount = earnings.availableBalance;
      const commissionClientRef = clientReference || `withdrawal_${mobileNumber}_${Date.now()}`;
      
      const result = await this.withdrawalService.processWithdrawalRequest(mobileNumber, withdrawalAmount, commissionClientRef);
      if (result.success) {
        await this.markAllCommissionsAsWithdrawn(mobileNumber, withdrawalAmount, commissionClientRef);
        
        return { 
          ...result, 
          newBalance: 0 
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

  /**
   * Mark all existing commission records as withdrawn - Simple approach
   */
  private async markAllCommissionsAsWithdrawn(mobileNumber: string, withdrawalAmount: number, clientReference: string): Promise<void> {
    await this.commissionLogModel.updateMany(
      { 
        mobileNumber, 
        logStatus: 'active',
        serviceType: { $ne: 'withdrawal_deduction' } 
      },
      { 
        $set: { 
          serviceType: 'withdrawal_deduction',
          commission: 0, 
          status: 'Withdrawn',
          message: `Withdrawn on ${new Date().toISOString()}`,
          updatedAt: new Date()
        }
      }
    );

    this.logger.log(`Marked all commissions as withdrawn for ${mobileNumber}, amount: ${withdrawalAmount}`);
  }

  private async createWithdrawalRefund(mobileNumber: string, amount: number, clientReference: string): Promise<void> {
    await this.commissionLogModel.create({
      clientReference: `withdrawal_refund_${clientReference}`,
      hubtelTransactionId: null,
      externalTransactionId: null,
      mobileNumber,
      sessionId: `withdrawal_refund_${Date.now()}`,
      orderId: `withdrawal_refund_${Date.now()}`,
      serviceType: 'withdrawal_refund',
      amount,
      commission: amount, 
      charges: 0,
      amountAfterCharges: amount,
      currencyCode: 'GHS',
      paymentMethod: 'refund',
      status: 'Completed',
      isFulfilled: true,
      responseCode: '0000',
      message: `Withdrawal refund for failed withdrawal: ${clientReference}`,
      commissionServiceStatus: 'delivered',
      transactionDate: new Date(),
      retryCount: 0,
      isRetryable: false,
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