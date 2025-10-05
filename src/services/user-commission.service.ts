import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, CommissionTransaction } from '../models/schemas/user.shema';
import { Transactions } from '../models/schemas/transaction.schema';
import { CommissionTransactionLogService } from './commission-transaction-log.service';

@Injectable()
export class UserCommissionService {
  private readonly logger = new Logger(UserCommissionService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Transactions.name) private readonly transactionModel: Model<Transactions>,
    private readonly commissionTransactionLogService: CommissionTransactionLogService,
  ) {}

  /**
   * Add commission earnings to user account from callback
   */
  async addCommissionEarningsToUser(callbackData: any): Promise<void> {
    try {
      const { ResponseCode, Data } = callbackData;
      
      if (ResponseCode !== '0000') {
        this.logger.warn(`Commission callback failed: ${Data?.Description}`);
        return;
      }

      const { TransactionId, ClientReference, Amount, Meta: { Commission } } = Data;
      const commissionAmount = parseFloat(Commission);
      
      // Get mobile number directly from transaction record
      const mobileNumber = await this.getMobileNumberFromTransaction(ClientReference);
      if (!mobileNumber) {
        this.logger.error(`Could not find mobile number for transaction ${ClientReference}`);
        return;
      }

      // Find or create user
      let user = await this.findUserByMobile(mobileNumber);
      if (!user) {
        user = await this.createUserFromMobile(mobileNumber);
      }

      // Add commission to user earnings
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
   * Add commission to user earnings
   */
  private async addCommissionToUser(user: any, commissionData: any): Promise<void> {
    const serviceType = await this.determineServiceType(commissionData.clientReference);
    
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

    await this.updateUserCommission(user, commissionTransaction);
  }

  /**
   * Get user commission transaction history
   */
  async getUserTransactionHistory(mobileNumber: string, limit: number = 20): Promise<CommissionTransaction[]> {
    try {
      const user = await this.findUserByMobile(mobileNumber);
      
      if (!user) {
        return [];
      }

      // Return recent transactions (most recent first)
      return user.commissionTransactions
        .sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime())
        .slice(0, limit);
    } catch (error) {
      this.logger.error(`Error getting user transaction history: ${error.message}`);
      return [];
    }
  }

  /**
   * Get user earnings by mobile number
   */
  async getUserEarnings(mobileNumber: string): Promise<{
    totalEarnings: number;
    availableBalance: number;
    totalWithdrawn: number;
    pendingWithdrawals: number;
    transactionCount: number;
  }> {
    try {
      const user = await this.findUserByMobile(mobileNumber);
      
      if (!user) {
        return {
          totalEarnings: 0,
          availableBalance: 0,
          totalWithdrawn: 0,
          pendingWithdrawals: 0,
          transactionCount: 0
        };
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
      return {
        totalEarnings: 0,
        availableBalance: 0,
        totalWithdrawn: 0,
        pendingWithdrawals: 0,
        transactionCount: 0
      };
    }
  }

  /**
   * Process withdrawal request
   */
  async processWithdrawalRequest(mobileNumber: string, amount: number): Promise<{
    success: boolean;
    message: string;
    newBalance?: number;
  }> {
    try {
      const user = await this.findUserByMobile(mobileNumber);
      
      if (!user) {
        return {
          success: false,
          message: 'User not found'
        };
      }

      if (user.availableBalance < amount) {
        return {
          success: false,
          message: 'Insufficient balance'
        };
      }

      // Update user balance
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

      return {
        success: true,
        message: 'Withdrawal request submitted successfully',
        newBalance
      };
    } catch (error) {
      this.logger.error(`Error processing withdrawal: ${error.message}`);
      return {
        success: false,
        message: 'Withdrawal processing failed'
      };
    }
  }

  /**
   * Find user by mobile number
   */
  private async findUserByMobile(mobileNumber: string): Promise<User | null> {
    try {
      return await this.userModel.findOne({ phone: mobileNumber }).exec();
    } catch (error) {
      this.logger.error(`Error finding user by mobile: ${error.message}`);
      return null;
    }
  }

  /**
   * Create user from mobile number
   */
  private async createUserFromMobile(mobileNumber: string): Promise<User> {
    try {
      const user = new this.userModel({
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

      return await user.save();
    } catch (error) {
      this.logger.error(`Error creating user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update user commission data
   */
  private async updateUserCommission(user: User, commissionTransaction: CommissionTransaction): Promise<void> {
    try {
      // Add commission transaction to user's record
      const updatedTransactions = [...user.commissionTransactions, commissionTransaction];
      
      // Calculate new totals
      const newTotalEarnings = user.totalEarnings + commissionTransaction.commission;
      const newAvailableBalance = user.availableBalance + commissionTransaction.commission;

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
    } catch (error) {
      this.logger.error(`Error updating user commission: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get mobile number directly from transaction record
   * This method gets mobile number from the main transaction collection
   */
  private async getMobileNumberFromTransaction(clientReference: string): Promise<string | null> {
    try {
      this.logger.log(`Looking for transaction with client reference: ${clientReference}`);
      
      // Query transaction collection directly using OrderId (which contains clientReference)
      const transaction = await this.transactionModel.findOne({ 
        OrderId: { $regex: clientReference }
      }).exec();
      
      if (transaction) {
        const mobileNumber = transaction.CustomerMobileNumber;
        this.logger.log(`Found transaction with mobile number: ${mobileNumber}`);
        return mobileNumber;
      }
      
      this.logger.warn(`No transaction found for client reference: ${clientReference}`);
      return null;
    } catch (error) {
      this.logger.error(`Error getting mobile number from transaction: ${error.message}`);
      return null;
    }
  }

  /**
   * Determine service type from transaction data
   */
  private async determineServiceType(clientReference: string): Promise<string> {
    try {
      // Query transaction collection directly
      const transaction = await this.transactionModel.findOne({ 
        OrderId: { $regex: clientReference }
      }).exec();
      
      return transaction?.ExtraData?.serviceType || 'unknown';
    } catch (error) {
      this.logger.error(`Error determining service type: ${error.message}`);
      return 'unknown';
    }
  }

  /**
   * Get commission statistics for admin
   */
  async getCommissionStatistics(): Promise<{
    totalUsers: number;
    totalEarnings: number;
    totalWithdrawn: number;
    pendingWithdrawals: number;
    averageEarningsPerUser: number;
  }> {
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

      const result = stats[0] || {
        totalUsers: 0,
        totalEarnings: 0,
        totalWithdrawn: 0,
        pendingWithdrawals: 0,
        averageEarnings: 0
      };

      return {
        totalUsers: result.totalUsers,
        totalEarnings: result.totalEarnings,
        totalWithdrawn: result.totalWithdrawn,
        pendingWithdrawals: result.pendingWithdrawals,
        averageEarningsPerUser: result.averageEarnings
      };
    } catch (error) {
      this.logger.error(`Error getting commission statistics: ${error.message}`);
      return {
        totalUsers: 0,
        totalEarnings: 0,
        totalWithdrawn: 0,
        pendingWithdrawals: 0,
        averageEarningsPerUser: 0
      };
    }
  }
}
