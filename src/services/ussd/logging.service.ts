import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { UssdLog } from "../../models/schemas/ussd-log.schema";
import { UssdLogData, UssdStatistics, PaginatedUssdLogs } from "./types";

@Injectable()
export class UssdLoggingService {
  constructor(
    @InjectModel(UssdLog.name) private readonly ussdLogModel: Model<UssdLog>
  ) {}

  /**
   * Log USSD interaction (upsert - update existing or create new)
   */
  async logUssdInteraction(logData: UssdLogData): Promise<void> {
    try {
      const logEntry = {
        mobileNumber: logData.mobileNumber,
        sessionId: logData.sessionId,
        sequence: logData.sequence,
        message: logData.message,
        serviceType: logData.serviceType,
        service: logData.service,
        flow: logData.flow,
        network: logData.network,
        amount: logData.amount,
        totalAmount: logData.totalAmount,
        quantity: logData.quantity,
        recipientName: logData.recipientName,
        recipientMobile: logData.recipientMobile,
        tvProvider: logData.tvProvider,
        accountNumber: logData.accountNumber,
        utilityProvider: logData.utilityProvider,
        meterNumber: logData.meterNumber,
        bundleValue: logData.bundleValue,
        selectedBundle: logData.selectedBundle,
        accountInfo: logData.accountInfo,
        meterInfo: logData.meterInfo,
        status: logData.status,
        userAgent: logData.userAgent,
        deviceInfo: logData.deviceInfo,
        location: logData.location,
      };

      // Only set dialedAt for new records (initiated status)
      if (logData.status === 'initiated') {
        logEntry['dialedAt'] = new Date();
      }

      // Use upsert to update existing record or create new one
      await this.ussdLogModel.findOneAndUpdate(
        { sessionId: logData.sessionId },
        logEntry,
        { 
          upsert: true, 
          new: true,
          setDefaultsOnInsert: true
        }
      );
    } catch (error) {
      console.error('Error logging USSD interaction:', error);
    }
  }

  /**
   * Update USSD log with completion status
   */
  async updateUssdLog(sessionId: string, status: string, additionalData: any = {}): Promise<void> {
    try {
      // Get existing record to calculate duration
      const existingLog = await this.ussdLogModel.findOne({ sessionId });
      
      const updateData = {
        status,
        completedAt: new Date(),
        ...additionalData
      };

      if (status === 'completed' && existingLog) {
        updateData.isSuccessful = true;
        updateData.duration = Math.floor((new Date().getTime() - existingLog.dialedAt.getTime()) / 1000);
      } else if (status === 'failed') {
        updateData.isSuccessful = false;
      }

      await this.ussdLogModel.findOneAndUpdate(
        { sessionId },
        { $set: updateData },
        { 
          new: true,
          upsert: false // Don't create if doesn't exist, should already exist
        }
      );
    } catch (error) {
      console.error('Error updating USSD log:', error);
    }
  }

  /**
   * Get USSD logs by mobile number
   */
  async getUssdLogsByMobile(mobileNumber: string, limit: number = 50): Promise<UssdLog[]> {
    try {
      return await this.ussdLogModel
        .find({ mobileNumber })
        .sort({ dialedAt: -1 })
        .limit(limit)
        .exec();
    } catch (error) {
      console.error('Error fetching USSD logs:', error);
      return [];
    }
  }

  /**
   * Get USSD logs by session ID
   */
  async getUssdLogsBySession(sessionId: string): Promise<UssdLog[]> {
    try {
      return await this.ussdLogModel
        .find({ sessionId })
        .sort({ sequence: 1 })
        .exec();
    } catch (error) {
      console.error('Error fetching USSD logs by session:', error);
      return [];
    }
  }

  /**
   * Get USSD statistics
   */
  async getUssdStatistics(): Promise<UssdStatistics> {
    try {
      const totalDialers = await this.ussdLogModel.distinct('mobileNumber').countDocuments();
      const todayDialers = await this.ussdLogModel.countDocuments({
        dialedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
      });
      const completedTransactions = await this.ussdLogModel.countDocuments({ status: 'completed' });
      const failedTransactions = await this.ussdLogModel.countDocuments({ status: 'failed' });

      return {
        totalDialers,
        todayDialers,
        completedTransactions,
        failedTransactions,
        successRate: totalDialers > 0 ? (completedTransactions / totalDialers * 100).toFixed(2) : '0'
      };
    } catch (error) {
      console.error('Error fetching USSD statistics:', error);
      return {
        totalDialers: 0,
        todayDialers: 0,
        completedTransactions: 0,
        failedTransactions: 0,
        successRate: '0'
      };
    }
  }

  /**
   * Get all USSD logs with pagination
   */
  async getAllUssdLogs(page: number = 1, limit: number = 50, status?: string): Promise<PaginatedUssdLogs> {
    try {
      const skip = (page - 1) * limit;
      const filter: any = {};

      if (status) {
        filter.status = status;
      }

      const [logs, total] = await Promise.all([
        this.ussdLogModel
          .find(filter)
          .sort({ dialedAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.ussdLogModel.countDocuments(filter)
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
      console.error('Error fetching all USSD logs:', error);
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
}
