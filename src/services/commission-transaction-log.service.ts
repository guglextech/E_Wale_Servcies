import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { CommissionTransactionLog } from "../models/schemas/commission-transaction-log.schema";
import { 
  CommissionTransactionLogData, 
  CommissionTransactionStats, 
  PaginatedCommissionLogs 
} from "../models/dto/commission-transaction-log.dto";

@Injectable()
export class CommissionTransactionLogService {
  constructor(
    @InjectModel(CommissionTransactionLog.name) 
    private readonly commissionLogModel: Model<CommissionTransactionLog>
  ) {}

  /**
   * Log commission transaction after payment
   */
  async logCommissionTransaction(logData: CommissionTransactionLogData): Promise<void> {
    try {
      const logEntry = {
        clientReference: logData.clientReference,
        hubtelTransactionId: logData.hubtelTransactionId,
        externalTransactionId: logData.externalTransactionId,
        mobileNumber: logData.mobileNumber,
        sessionId: logData.SessionId,
        orderId: logData.OrderId,
        serviceType: logData.serviceType,
        network: logData.network,
        tvProvider: logData.tvProvider,
        utilityProvider: logData.utilityProvider,
        bundleValue: logData.bundleValue,
        selectedBundle: logData.selectedBundle,
        accountNumber: logData.accountNumber,
        meterNumber: logData.meterNumber,
        amount: logData.amount,
        commission: logData.commission,
        charges: logData.charges,
        amountAfterCharges: logData.amountAfterCharges,
        currencyCode: logData.currencyCode,
        paymentMethod: logData.paymentMethod,
        status: logData.status,
        isFulfilled: logData.isFulfilled,
        responseCode: logData.responseCode,
        message: logData.message,
        transactionDate: logData.transactionDate || new Date(),
        errorMessage: logData.errorMessage,
        logStatus: 'active'
      };

      // Use upsert to update existing record or create new one
      await this.commissionLogModel.findOneAndUpdate(
        { clientReference: logData.clientReference },
        logEntry,
        { 
          upsert: true, 
          new: true,
          setDefaultsOnInsert: true
        }
      );
    } catch (error) {
      console.error('Error logging commission transaction:', error);
    }
  }

  /**
   * Update commission amount in commission log
   */
  async updateCommissionAmount(clientReference: string, commissionAmount: number): Promise<void> {
    try {
      console.log(`🔍 UPDATING COMMISSION - ClientRef: ${clientReference}, Amount: ${commissionAmount}`);
      const result = await this.commissionLogModel.findOneAndUpdate(
        { clientReference },
        { 
          $set: { 
            commission: commissionAmount,
            updatedAt: new Date()
          } 
        },
        { new: true }
      );
      
      if (result) {
        console.log(`✅ COMMISSION UPDATED SUCCESSFULLY - ClientRef: ${clientReference}, New Amount: ${result.commission}`);
      } else {
        console.log(`❌ NO RECORD FOUND - ClientRef: ${clientReference}`);
      }
    } catch (error) {
      console.error('❌ ERROR updating commission amount:', error);
    }
  }

  /**
   * Update commission service status
   */
  async updateCommissionServiceStatus(
    clientReference: string, 
    status: string, 
    message: string,
    isFulfilled?: boolean,
    errorMessage?: string
  ): Promise<void> {
    try {
      const updateData: any = {
        commissionServiceStatus: status,
        commissionServiceMessage: message,
        commissionServiceDate: new Date()
      };

      if (isFulfilled !== undefined) {
        updateData.isFulfilled = isFulfilled;
      }

      if (errorMessage) {
        updateData.errorMessage = errorMessage;
      }

      await this.commissionLogModel.findOneAndUpdate(
        { clientReference },
        { $set: updateData },
        { new: false }
      );
    } catch (error) {
      console.error('Error updating commission service status:', error);
    }
  }

  /**
   * Get commission transaction logs by mobile number
   */
  async getCommissionLogsByMobile(mobileNumber: string, limit: number = 50): Promise<CommissionTransactionLog[]> {
    try {
      return await this.commissionLogModel
        .find({ mobileNumber, logStatus: 'active' })
        .sort({ createdAt: -1 })
        .limit(limit)
        .exec();
    } catch (error) {
      console.error('Error fetching commission logs by mobile:', error);
      return [];
    }
  }

  /**
   * Get commission transaction logs by session ID
   */
  async getCommissionLogsBySession(sessionId: string): Promise<CommissionTransactionLog[]> {
    try {
      return await this.commissionLogModel
        .find({ sessionId, logStatus: 'active' })
        .sort({ createdAt: 1 })
        .exec();
    } catch (error) {
      console.error('Error fetching commission logs by session:', error);
      return [];
    }
  }

  /**
   * Get commission transaction log by client reference
   */
  async getCommissionLogByClientReference(clientReference: string): Promise<CommissionTransactionLog | null> {
    try {
      return await this.commissionLogModel
        .findOne({ clientReference, logStatus: 'active' })
        .exec();
    } catch (error) {
      console.error('Error fetching commission log by client reference:', error);
      return null;
    }
  }

  /**
   * Get commission transaction statistics
   */
  async getCommissionTransactionStats(): Promise<CommissionTransactionStats> {
    try {
      const [
        totalTransactions,
        successfulTransactions,
        failedTransactions,
        pendingTransactions,
        deliveredServices,
        failedServices,
        pendingServices,
        amountStats
      ] = await Promise.all([
        this.commissionLogModel.countDocuments({ logStatus: 'active' }),
        this.commissionLogModel.countDocuments({ status: 'Paid', logStatus: 'active' }),
        this.commissionLogModel.countDocuments({ status: 'Unpaid', logStatus: 'active' }),
        this.commissionLogModel.countDocuments({ status: 'Pending', logStatus: 'active' }),
        this.commissionLogModel.countDocuments({ commissionServiceStatus: 'delivered', logStatus: 'active' }),
        this.commissionLogModel.countDocuments({ commissionServiceStatus: 'failed', logStatus: 'active' }),
        this.commissionLogModel.countDocuments({ commissionServiceStatus: 'pending', logStatus: 'active' }),
        this.commissionLogModel.aggregate([
          { $match: { logStatus: 'active' } },
          {
            $group: {
              _id: null,
              totalAmount: { $sum: '$amount' },
              totalCharges: { $sum: '$charges' },
              totalAmountAfterCharges: { $sum: '$amountAfterCharges' }
            }
          }
        ])
      ]);

      const stats = amountStats[0] || { totalAmount: 0, totalCharges: 0, totalAmountAfterCharges: 0 };

      return {
        totalTransactions,
        successfulTransactions,
        failedTransactions,
        pendingTransactions,
        deliveredServices,
        failedServices,
        pendingServices,
        successRate: totalTransactions > 0 ? (successfulTransactions / totalTransactions * 100).toFixed(2) : '0',
        deliveryRate: totalTransactions > 0 ? (deliveredServices / totalTransactions * 100).toFixed(2) : '0',
        totalAmount: stats.totalAmount,
        totalCharges: stats.totalCharges,
        totalAmountAfterCharges: stats.totalAmountAfterCharges
      };
    } catch (error) {
      console.error('Error fetching commission transaction statistics:', error);
      return {
        totalTransactions: 0,
        successfulTransactions: 0,
        failedTransactions: 0,
        pendingTransactions: 0,
        deliveredServices: 0,
        failedServices: 0,
        pendingServices: 0,
        successRate: '0',
        deliveryRate: '0',
        totalAmount: 0,
        totalCharges: 0,
        totalAmountAfterCharges: 0
      };
    }
  }

  /**
   * Get all commission transaction logs with pagination
   */
  async getAllCommissionLogs(
    page: number = 1, 
    limit: number = 50, 
    status?: string,
    commissionServiceStatus?: string,
    serviceType?: string
  ): Promise<PaginatedCommissionLogs> {
    try {
      const skip = (page - 1) * limit;
      const filter: any = { logStatus: 'active' };

      if (status) {
        filter.status = status;
      }
      if (commissionServiceStatus) {
        filter.commissionServiceStatus = commissionServiceStatus;
      }
      if (serviceType) {
        filter.serviceType = serviceType;
      }

      const [logs, total] = await Promise.all([
        this.commissionLogModel
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.commissionLogModel.countDocuments(filter)
      ]);

      return {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      console.error('Error fetching all commission logs:', error);
      return { 
        logs: [], 
        pagination: {
          page: 1,
          limit: 50,
          total: 0,
          pages: 0,
          hasNext: false,
          hasPrev: false
        }
      };
    }
  }

  /**
   * Get retryable failed transactions
   */
  async getRetryableFailedTransactions(): Promise<CommissionTransactionLog[]> {
    try {
      return await this.commissionLogModel
        .find({
          commissionServiceStatus: 'failed',
          isRetryable: true,
          retryCount: { $lt: 3 }, // Max 3 retries
          logStatus: 'active'
        })
        .sort({ createdAt: 1 })
        .limit(100) // Process max 100 at a time
        .exec();
    } catch (error) {
      console.error('Error fetching retryable failed transactions:', error);
      return [];
    }
  }

  /**
   * Increment retry count
   */
  async incrementRetryCount(clientReference: string): Promise<void> {
    try {
      await this.commissionLogModel.findOneAndUpdate(
        { clientReference },
        { 
          $inc: { retryCount: 1 },
          $set: { lastRetryAt: new Date() }
        }
      );
    } catch (error) {
      console.error('Error incrementing retry count:', error);
    }
  }
}
