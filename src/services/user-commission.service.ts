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
        return this.getDefaultEarnings();
      }
      
      // Separate earnings from withdrawals
      let totalEarnings = 0;
      let totalWithdrawn = 0;
      
      commissionLogs.forEach(log => {
        const commission = log.commission || 0;
        console.log(`Log ${log.clientReference}: Commission = ${commission}, ServiceType = ${log.serviceType}, Status = ${log.status}`);
        
        if (log.serviceType === 'withdrawal_deduction') {
          totalWithdrawn += Math.abs(commission); // Withdrawal deductions are negative
        } else if (log.serviceType === 'pending_withdrawal') {
          // Pending withdrawals reduce available balance but don't count as withdrawn yet
        } else {
          totalEarnings += commission; // Regular earnings are positive
        }
      });
      
      // Calculate pending withdrawals separately
      const pendingWithdrawals = commissionLogs
        .filter(log => log.serviceType === 'pending_withdrawal')
        .reduce((sum, log) => sum + log.amount, 0);
      
      const availableBalance = totalEarnings - totalWithdrawn - pendingWithdrawals; 
      const transactionCount = commissionLogs.length;
      
      console.log(`Commission logs earnings for ${mobileNumber}:`, {
        totalEarnings,
        totalWithdrawn,
        availableBalance,
        pendingWithdrawals,
        transactionCount
      });
      console.log(`==========================================`);

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
        // DON'T deduct balance immediately - wait for callback confirmation
        // Only create a pending withdrawal record
        await this.createPendingWithdrawal(mobileNumber, amount, result.transactionId);
        return { 
          ...result, 
          newBalance: earnings.availableBalance // Balance unchanged until callback confirms
        };
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Error processing withdrawal: ${error.message}`);
      return { success: false, message: `Withdrawal processing failed: ${error.message}` };
    }
  }

  /**
   * Create pending withdrawal record (no balance deduction yet)
   */
  private async createPendingWithdrawal(mobileNumber: string, amount: number, transactionId?: string): Promise<void> {
    try {
      const pendingWithdrawal = {
        clientReference: `pending_withdrawal_${mobileNumber}_${Date.now()}`,
        hubtelTransactionId: transactionId || null,
        externalTransactionId: null,
        mobileNumber: mobileNumber,
        sessionId: `pending_withdrawal_${Date.now()}`,
        serviceType: 'pending_withdrawal',
        amount: amount,
        commission: 0, // No commission deduction yet
        charges: 0,
        amountAfterCharges: amount,
        currencyCode: 'GHS',
        paymentMethod: 'withdrawal',
        status: 'Pending',
        isFulfilled: false,
        responseCode: '0001', // Pending status
        message: `Pending withdrawal for ${mobileNumber}`,
        commissionServiceStatus: 'pending',
        transactionDate: new Date(),
        retryCount: 0,
        isRetryable: true,
        logStatus: 'active'
      };

      await this.commissionLogModel.create(pendingWithdrawal);
      this.logger.log(`Created pending withdrawal for ${mobileNumber}: GH ${amount}`);
    } catch (error) {
      this.logger.error(`Error creating pending withdrawal: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create withdrawal deduction entry in commission logs (only after successful callback)
   */
  private async createWithdrawalDeduction(mobileNumber: string, amount: number, transactionId?: string): Promise<void> {
    try {
      const withdrawalDeduction = {
        clientReference: `withdrawal_deduction_${mobileNumber}_${Date.now()}`,
        hubtelTransactionId: transactionId || null,
        externalTransactionId: null,
        mobileNumber: mobileNumber,
        sessionId: `withdrawal_deduction_${Date.now()}`,
        serviceType: 'withdrawal_deduction',
        amount: amount,
        commission: -amount, 
        charges: 0,
        amountAfterCharges: amount,
        currencyCode: 'GHS',
        paymentMethod: 'withdrawal',
        status: 'Completed',
        isFulfilled: true,
        responseCode: '0000',
        message: `Withdrawal deduction for ${mobileNumber}`,
        commissionServiceStatus: 'delivered',
        transactionDate: new Date(),
        retryCount: 0,
        isRetryable: false,
        logStatus: 'active'
      };

      await this.commissionLogModel.create(withdrawalDeduction);
      this.logger.log(`Created withdrawal deduction for ${mobileNumber}: GH ${amount}`);
    } catch (error) {
      this.logger.error(`Error creating withdrawal deduction: ${error.message}`);
      throw error;
    }
  }

  /**
   * Handle send money callback from Hubtel
   */
  async handleSendMoneyCallback(callbackData: any): Promise<void> {
    try {
      const { ResponseCode, Data } = callbackData;
      const { ClientReference, TransactionId } = Data;

      // Delegate to withdrawal service
      await this.withdrawalService.handleSendMoneyCallback(callbackData);

      // Get the withdrawal record to find the mobile number and amount
      const withdrawalRecord = await this.withdrawalService.getWithdrawalByClientReference(ClientReference);
      
      if (!withdrawalRecord) {
        this.logger.error(`Withdrawal record not found for client reference: ${ClientReference}`);
        return;
      }

      const { mobileNumber, amount } = withdrawalRecord;

      if (ResponseCode === '0000') {
        // Withdrawal successful - now deduct the balance
        await this.createWithdrawalDeduction(mobileNumber, amount, TransactionId);
        
        // Remove the pending withdrawal record
        await this.commissionLogModel.findOneAndUpdate(
          { 
            mobileNumber: mobileNumber,
            serviceType: 'pending_withdrawal',
            hubtelTransactionId: TransactionId
          },
          { logStatus: 'inactive' }
        );
        
        this.logger.log(`Withdrawal completed successfully for ${mobileNumber}: GH ${amount}`);
      } else {
        // Withdrawal failed - remove pending record (no balance deduction needed)
        await this.commissionLogModel.findOneAndUpdate(
          { 
            mobileNumber: mobileNumber,
            serviceType: 'pending_withdrawal',
            hubtelTransactionId: TransactionId
          },
          { 
            logStatus: 'inactive',
            status: 'Failed',
            message: `Withdrawal failed: ${Data?.Description || 'Unknown error'}`
          }
        );
        
        this.logger.log(`Withdrawal failed for ${mobileNumber}: GH ${amount} - No balance deduction applied`);
      }
    } catch (error) {
      this.logger.error(`Error handling withdrawal callback: ${error.message}`);
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