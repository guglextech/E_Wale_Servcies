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
   * Process commission callback and update user earnings
   */
  async processCommissionCallback(callbackData: any): Promise<void> {
    try {
      const { 
        ResponseCode, 
        Data: { 
          TransactionId, 
          ClientReference, 
          ExternalTransactionId, 
          Amount, 
          Meta: { Commission },
          Description 
        } 
      } = callbackData;

      if (ResponseCode !== '0000') {
        this.logger.warn(`Commission callback failed for ${ClientReference}: ${Description}`);
        return;
      }

      // Extract mobile number from client reference or transaction data
      const mobileNumber = await this.extractMobileNumberFromTransaction(ClientReference);
      if (!mobileNumber) {
        this.logger.error(`Could not extract mobile number for transaction ${ClientReference}`);
        return;
      }

      // Find or create user by mobile number
      let user = await this.findUserByMobile(mobileNumber);
      if (!user) {
        user = await this.createUserFromMobile(mobileNumber);
      }

      // Create commission transaction record
      const commissionTransaction: CommissionTransaction = {
        transactionId: TransactionId,
        clientReference: ClientReference,
        externalTransactionId: ExternalTransactionId,
        amount: Amount,
        commission: parseFloat(Commission),
        serviceType: await this.determineServiceType(ClientReference),
        transactionDate: new Date(),
        status: 'completed'
      };

      // Update user's commission data
      await this.updateUserCommission(user, commissionTransaction);

      this.logger.log(`Commission processed for ${mobileNumber}: GH ${Commission}`);

    } catch (error) {
      this.logger.error(`Error processing commission callback: ${error.message}`);
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
   * Extract mobile number from transaction data
   * This method extracts mobile number from commission transaction logs
   */
  private async extractMobileNumberFromTransaction(clientReference: string): Promise<string | null> {
    try {
      // Query commission transaction logs to get mobile number
      const commissionLog = await this.commissionTransactionLogService.getCommissionLogByClientReference(clientReference);
      return commissionLog?.mobileNumber || null;
    } catch (error) {
      this.logger.error(`Error extracting mobile number: ${error.message}`);
      return null;
    }
  }

  /**
   * Determine service type from transaction data
   */
  private async determineServiceType(clientReference: string): Promise<string> {
    try {
      // Query commission transaction logs to determine the service type
      const commissionLog = await this.commissionTransactionLogService.getCommissionLogByClientReference(clientReference);
      return commissionLog?.serviceType || 'unknown';
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
