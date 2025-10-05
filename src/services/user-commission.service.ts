import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, CommissionTransaction } from '../models/schemas/user.shema';
import { CommissionTransactionLogService } from './commission-transaction-log.service';

@Injectable()
export class UserCommissionService {
  private readonly logger = new Logger(UserCommissionService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly commissionTransactionLogService: CommissionTransactionLogService,
  ) {}

  /**
   * Process commission callback and add earnings to user
   */
  async addCommissionEarningsToUser(callbackData: any): Promise<void> {
    try {
      console.log('=== COMMISSION CALLBACK PROCESSING START ===');
      console.log('Callback data:', JSON.stringify(callbackData, null, 2));
      
      const { ResponseCode, Data } = callbackData;
      
      if (ResponseCode !== '0000') {
        this.logger.warn(`Commission callback failed: ${Data?.Description}`);
        return;
      }

      const { TransactionId, ClientReference, Amount, Meta: { Commission } } = Data;
      const commissionAmount = parseFloat(Commission);
      
      console.log(`Looking for commission transaction log with clientReference: ${ClientReference}`);
      
      // Find the commission transaction log using clientReference
      const commissionLog = await this.commissionTransactionLogService.getCommissionLogByClientReference(ClientReference);
      console.log('Found commission log:', commissionLog ? 'YES' : 'NO');
      
      if (!commissionLog) {
        this.logger.error(`Could not find commission transaction log for clientReference ${ClientReference}`);
        console.log('=== COMMISSION CALLBACK PROCESSING FAILED - NO COMMISSION LOG ===');
        return;
      }

      const mobileNumber = commissionLog.mobileNumber;
      console.log(`Processing commission for mobile: ${mobileNumber}, amount: ${commissionAmount}`);
      
      const user = await this.findOrCreateUser(mobileNumber);
      console.log('User found/created:', user ? 'YES' : 'NO');
      
      await this.addCommissionToUser(user, {
        transactionId: TransactionId,
        clientReference: ClientReference,
        amount: Amount,
        commission: commissionAmount,
        transactionDate: new Date()
      });

      this.logger.log(`Added commission GH ${commissionAmount} to user ${mobileNumber}`);
      console.log('=== COMMISSION CALLBACK PROCESSING SUCCESS ===');
    } catch (error) {
      this.logger.error(`Error processing commission callback: ${error.message}`);
      console.log('=== COMMISSION CALLBACK PROCESSING ERROR ===', error);
    }
  }

  /**
   * Get user earnings by mobile number
   */
  async getUserEarnings(mobileNumber: string) {
    try {
      const user = await this.findUserByMobile(mobileNumber);
      
      if (!user) {
        return this.getDefaultEarnings();
      }

      return {
        totalEarnings: user.totalEarnings,
        availableBalance: user.availableBalance,
        totalWithdrawn: user.totalWithdrawn,
        pendingWithdrawals: user.pendingWithdrawals,
        transactionCount: user.commissionTransactions.length
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
      const user = await this.findUserByMobile(mobileNumber);
      
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      if (user.availableBalance < amount) {
        return { success: false, message: 'Insufficient balance' };
      }

      const newBalance = user.availableBalance - amount;
      const newPendingWithdrawals = user.pendingWithdrawals + amount;

      await this.userModel.findOneAndUpdate(
        { phone: mobileNumber },
        {
          $set: {
            availableBalance: newBalance,
            pendingWithdrawals: newPendingWithdrawals,
            updatedAt: new Date()
          }
        }
      );

      this.logger.log(`Withdrawal request processed for ${mobileNumber}: GH ${amount}`);
      return { success: true, message: 'Withdrawal request submitted successfully', newBalance };
    } catch (error) {
      this.logger.error(`Error processing withdrawal: ${error.message}`);
      return { success: false, message: 'Withdrawal processing failed' };
    }
  }

  /**
   * Get user transaction history
   */
  async getUserTransactionHistory(mobileNumber: string, limit: number = 20): Promise<CommissionTransaction[]> {
    try {
      const user = await this.findUserByMobile(mobileNumber);
      if (!user) return [];

      return user.commissionTransactions
        .sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime())
        .slice(0, limit);
    } catch (error) {
      this.logger.error(`Error getting user transaction history: ${error.message}`);
      return [];
    }
  }

  /**
   * Process existing commission transactions (backfill)
   */
  async processExistingCommissionTransactions() {
    try {
      this.logger.log('Starting to process existing commission transactions...');
      
      // Get all commission transaction logs that are delivered but haven't been processed
      const commissionLogs = await this.commissionTransactionLogService.getAllCommissionLogs(1, 1000, 'Paid', 'delivered');

      let processed = 0;
      let errors = 0;

      for (const log of commissionLogs.logs) {
        try {
          const mobileNumber = log.mobileNumber;
          if (!mobileNumber) {
            errors++;
            continue;
          }

          const user = await this.findUserByMobile(mobileNumber);
          if (user?.commissionTransactions.find(ct => ct.clientReference === log.clientReference)) {
            continue; // Already processed
          }

          // Calculate commission amount (this would need to be stored in the commission log)
          const commissionAmount = 0.01; // Placeholder - you'd need to store actual commission in the log
          if (commissionAmount > 0) {
            const userToUpdate = await this.findOrCreateUser(mobileNumber);
            await this.addCommissionToUser(userToUpdate, {
              transactionId: log.hubtelTransactionId || log.clientReference,
              clientReference: log.clientReference,
              amount: log.amount,
              commission: commissionAmount,
              transactionDate: log.transactionDate
            });
            processed++;
          }
        } catch (error) {
          this.logger.error(`Error processing commission log ${log.clientReference}: ${error.message}`);
          errors++;
        }
      }

      this.logger.log(`Commission processing completed. Processed: ${processed}, Errors: ${errors}`);
      return { processed, errors };
    } catch (error) {
      this.logger.error(`Error processing existing commission transactions: ${error.message}`);
      return { processed: 0, errors: 1 };
    }
  }

  /**
   * Get commission statistics
   */
  async getCommissionStatistics() {
    try {
      const stats = await this.userModel.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            totalEarnings: { $sum: '$totalEarnings' },
            totalWithdrawn: { $sum: '$totalWithdrawn' },
            pendingWithdrawals: { $sum: '$pendingWithdrawals' },
            averageEarnings: { $avg: '$totalEarnings' }
          }
        }
      ]);

      const result = stats[0] || this.getDefaultStats();
      return {
        totalUsers: result.totalUsers,
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

  // ==================== PRIVATE HELPER METHODS ====================

  private async findUserByMobile(mobileNumber: string): Promise<User | null> {
    try {
      return await this.userModel.findOne({ phone: mobileNumber }).exec();
    } catch (error) {
      this.logger.error(`Error finding user by mobile: ${error.message}`);
      return null;
    }
  }

  private async findOrCreateUser(mobileNumber: string): Promise<User> {
    let user = await this.findUserByMobile(mobileNumber);
    if (!user) {
      user = await this.userModel.create({
        username: mobileNumber,
        phone: mobileNumber,
        role: 'user',
        permissions: [],
        commissionTransactions: [],
        totalEarnings: 0,
        availableBalance: 0,
        totalWithdrawn: 0,
        pendingWithdrawals: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    return user;
  }

  private async addCommissionToUser(user: User, commissionData: any): Promise<void> {
    console.log('=== ADDING COMMISSION TO USER ===');
    console.log('User phone:', user.phone);
    console.log('Commission data:', commissionData);
    
    const serviceType = await this.getServiceType(commissionData.clientReference);
    console.log('Service type:', serviceType);
    
    const commissionTransaction: CommissionTransaction = {
      transactionId: commissionData.transactionId,
      clientReference: commissionData.clientReference,
      externalTransactionId: commissionData.transactionId,
      amount: commissionData.amount,
      commission: commissionData.commission,
      serviceType: serviceType,
      transactionDate: commissionData.transactionDate,
      status: 'completed'
    };

    console.log('Commission transaction object:', commissionTransaction);

    const updatedTransactions = [...user.commissionTransactions, commissionTransaction];
    const newTotalEarnings = user.totalEarnings + commissionTransaction.commission;
    const newAvailableBalance = user.availableBalance + commissionTransaction.commission;

    console.log('Updated totals:', {
      oldTotalEarnings: user.totalEarnings,
      newTotalEarnings,
      oldAvailableBalance: user.availableBalance,
      newAvailableBalance
    });

    await this.userModel.findOneAndUpdate(
      { phone: user.phone },
      {
        $set: {
          commissionTransactions: updatedTransactions,
          totalEarnings: newTotalEarnings,
          availableBalance: newAvailableBalance,
          updatedAt: new Date()
        }
      }
    );
    
    console.log('=== COMMISSION ADDED TO USER SUCCESSFULLY ===');
  }

  private async getServiceType(clientReference: string): Promise<string> {
    try {
      const commissionLog = await this.commissionTransactionLogService.getCommissionLogByClientReference(clientReference);
      return commissionLog?.serviceType || 'unknown';
    } catch (error) {
      this.logger.error(`Error determining service type: ${error.message}`);
      return 'unknown';
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