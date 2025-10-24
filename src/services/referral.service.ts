import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Referral } from '../models/schemas/referral.schema';
import { User } from '../models/schemas/user.shema';

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    @InjectModel(Referral.name) private referralModel: Model<Referral>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  /**
   * Generate a new referral code
   */
  async generateReferralCode(name: string, mobileNumber: string): Promise<string> {
    try {
      // Get the next available code
      const lastReferral = await this.referralModel.findOne().sort({ referralCode: -1 });
      let nextCode = '01';
      
      if (lastReferral) {
        const currentCode = parseInt(lastReferral.referralCode);
        nextCode = String(currentCode + 1).padStart(2, '0');
      }

      // Create new referral record
      const referral = new this.referralModel({
        referralCode: nextCode,
        name,
        mobileNumber,
        totalReferrals: 0,
        totalEarnings: 0,
        referredUsers: [],
        isActive: true
      });

      await referral.save();
      this.logger.log(`Generated referral code ${nextCode} for ${name}`);
      return nextCode;
    } catch (error) {
      this.logger.error(`Error generating referral code: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate and process referral code
   */
  async processReferralCode(referralCode: string, userMobile: string): Promise<{ success: boolean; message: string; referrerName?: string }> {
    try {
      // Check if referral code exists and is active
      const referral = await this.referralModel.findOne({ 
        referralCode, 
        isActive: true 
      });

      if (!referral) {
        return { success: false, message: 'Invalid referral code' };
      }

      // Check if user is trying to refer themselves
      if (referral.mobileNumber === userMobile) {
        return { success: false, message: 'Cannot use your own referral code' };
      }

      // Check if user has already been referred
      const existingUser = await this.userModel.findOne({ phone: userMobile });
      if (existingUser && existingUser.referredBy) {
        return { success: false, message: 'You have already used a referral code' };
      }

      // Update referral record
      await this.referralModel.findByIdAndUpdate(referral._id, {
        $inc: { totalReferrals: 1 },
        $push: { referredUsers: userMobile }
      });

      // Update user record
      await this.userModel.findOneAndUpdate(
        { phone: userMobile },
        { 
          referredBy: referral.mobileNumber,
          referralCode: referralCode
        },
        { upsert: true }
      );

      this.logger.log(`Referral code ${referralCode} processed for user ${userMobile}`);
      return { 
        success: true, 
        message: 'Referral code applied successfully',
        referrerName: referral.name
      };
    } catch (error) {
      this.logger.error(`Error processing referral code: ${error.message}`);
      return { success: false, message: 'Error processing referral code' };
    }
  }

  /**
   * Get referral by code
   */
  async getReferralByCode(referralCode: string): Promise<Referral | null> {
    try {
      return await this.referralModel.findOne({ referralCode, isActive: true });
    } catch (error) {
      this.logger.error(`Error fetching referral by code: ${error.message}`);
      return null;
    }
  }

  /**
   * Get user's referral information
   */
  async getUserReferralInfo(mobileNumber: string): Promise<any> {
    try {
      const user = await this.userModel.findOne({ phone: mobileNumber });
      if (!user) return null;

      const referral = await this.referralModel.findOne({ mobileNumber });
      
      return {
        userReferralCode: user.referralCode,
        referredBy: user.referredBy,
        referralEarnings: user.referralEarnings,
        totalReferrals: user.totalReferrals,
        referrerInfo: referral ? {
          name: referral.name,
          totalReferrals: referral.totalReferrals,
          totalEarnings: referral.totalEarnings
        } : null
      };
    } catch (error) {
      this.logger.error(`Error fetching user referral info: ${error.message}`);
      return null;
    }
  }

  /**
   * Award referral bonus (called after successful payment)
   */
  async awardReferralBonus(userMobile: string, amount: number): Promise<void> {
    try {
      const user = await this.userModel.findOne({ phone: userMobile });
      if (!user || !user.referredBy) return;

      const bonusAmount = amount * 0.05; // 5% referral bonus

      // Update referrer's earnings
      await this.referralModel.findOneAndUpdate(
        { mobileNumber: user.referredBy },
        { $inc: { totalEarnings: bonusAmount } }
      );

      // Update user's referral earnings
      await this.userModel.findOneAndUpdate(
        { phone: userMobile },
        { $inc: { referralEarnings: bonusAmount } }
      );

      this.logger.log(`Awarded referral bonus of ${bonusAmount} to referrer ${user.referredBy} for user ${userMobile}`);
    } catch (error) {
      this.logger.error(`Error awarding referral bonus: ${error.message}`);
    }
  }

  /**
   * Initialize default referral codes (for existing users)
   */
  async initializeDefaultReferralCodes(): Promise<void> {
    try {
      const defaultReferrals = [
        { name: 'Samuel Acquah', mobileNumber: '233550982043' },
        { name: 'Daniel Martey', mobileNumber: '233246912184' }
      ];

      for (const referral of defaultReferrals) {
        const existing = await this.referralModel.findOne({ mobileNumber: referral.mobileNumber });
        if (!existing) {
          await this.generateReferralCode(referral.name, referral.mobileNumber);
        }
      }

      this.logger.log('Default referral codes initialized');
    } catch (error) {
      this.logger.error(`Error initializing default referral codes: ${error.message}`);
    }
  }
}
