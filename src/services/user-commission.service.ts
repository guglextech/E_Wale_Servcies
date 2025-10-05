import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, CommissionTransaction } from '../models/schemas/user.shema';
import { Transactions } from '../models/schemas/transaction.schema';

@Injectable()
export class UserCommissionService {
  private readonly logger = new Logger(UserCommissionService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Transactions.name) private readonly transactionModel: Model<Transactions>,
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
      
      console.log(`Processing commission for clientReference: ${ClientReference}, amount: ${commissionAmount}`);
      
      // Find the transaction using clientReference to get the mobile number
      const transaction = await this.transactionModel.findOne({ 
        SessionId: ClientReference,
        IsSuccessful: true 
      });
      
      if (!transaction) {
        this.logger.error(`Could not find transaction for clientReference ${ClientReference}`);
        return;
      }

      const mobileNumber = transaction.CustomerMobileNumber;
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
      
      const user = await this.findUserByMobile(mobileNumber);
      
      if (!user) {
        console.log(`No user found for mobile: ${mobileNumber}, returning default earnings`);
        return this.getDefaultEarnings();
      }

      console.log(`User earnings for ${mobileNumber}:`, {
        totalEarnings: user.totalEarnings,
        availableBalance: user.availableBalance,
        totalWithdrawn: user.totalWithdrawn,
        pendingWithdrawals: user.pendingWithdrawals,
        transactionCount: user.commissionTransactions.length
      });

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

      if (amount < 10) {
        return { success: false, message: 'Minimum withdrawal amount is GH 10.00' };
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
      console.log(`Created new user for mobile: ${mobileNumber}`);
    }
    return user;
  }

  private async addCommissionToUser(user: User, commissionData: any): Promise<void> {
    console.log('=== ADDING COMMISSION TO USER ===');
    console.log('User phone:', user.phone);
    console.log('Commission data:', commissionData);
    
    const commissionTransaction: CommissionTransaction = {
      transactionId: commissionData.transactionId,
      clientReference: commissionData.clientReference,
      externalTransactionId: commissionData.transactionId,
      amount: commissionData.amount,
      commission: commissionData.commission,
      serviceType: 'commission_service',
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