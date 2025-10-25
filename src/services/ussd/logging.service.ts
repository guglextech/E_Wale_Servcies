import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { UssdLog } from "../../models/schemas/ussd-log.schema";
import { SessionState } from "./types";

@Injectable()
export class UssdLoggingService {
  constructor(
    @InjectModel(UssdLog.name) private readonly ussdLogModel: Model<UssdLog>
  ) { }

  /**
   * Log current session state once per service
   */
  async logSessionState(sessionId: string, mobileNumber: string, state: SessionState, status: string = 'active'): Promise<void> {
    try {
      const logEntry = {
        mobileNumber,
        sessionId,
        sequence: 0, 
        message: 'Session State',
        serviceType: state.serviceType,
        service: state.service,
        flow: state.flow,
        network: state.network,
        amount: state.amount,
        totalAmount: state.totalAmount,
        quantity: state.quantity,
        recipientName: state.name,
        recipientMobile: state.mobile,
        tvProvider: state.tvProvider,
        accountNumber: state.accountNumber,
        utilityProvider: state.utilityProvider,
        meterNumber: state.meterNumber,
        bundleValue: state.bundleValue,
        selectedBundle: state.selectedBundle,
        accountInfo: state.accountInfo,
        meterInfo: state.meterInfo,
        status,
        userAgent: 'USSD',
        deviceInfo: 'Mobile USSD',
        location: 'Ghana',
        dialedAt: new Date()
      };

      // Use upsert to update existing record or create new one
      await this.ussdLogModel.findOneAndUpdate(
        { sessionId },
        logEntry,
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );
    } catch (error) {
      console.error('Error logging session state:', error);
    }
  }

  /**
   * Update session status (completed, failed, cancelled)
   */
  async updateSessionStatus(sessionId: string, status: string, additionalData: any = {}): Promise<void> {
    try {
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
          upsert: false
        }
      );
    } catch (error) {
      console.error('Error updating session status:', error);
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
  async getUssdStatistics(): Promise<any> {
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
}
