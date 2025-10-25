import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ReferralService } from '../services/referral.service';
import { ReferralInitializationService } from '../services/referral-initialization.service';

@Controller('referral')
export class ReferralController {
  constructor(
    private readonly referralService: ReferralService,
    private readonly referralInitializationService: ReferralInitializationService
  ) { }

  /**
   * Initialize default referral codes
   */
  @Post('initialize')
  async initializeDefaultCodes() {
    await this.referralInitializationService.initializeDefaultReferralCodes();
    return { message: 'Default referral codes initialized successfully' };
  }

  /**
   * Generate a new referral code
   */
  @Post('generate')
  async generateReferralCode(@Body() body: { name: string; mobileNumber: string }) {
    const referralCode = await this.referralService.generateReferralCode(body.name, body.mobileNumber);
    return { referralCode, message: 'Referral code generated successfully' };
  }

  /**
   * Process a referral code
   */
  @Post('process')
  async processReferralCode(@Body() body: { referralCode: string; userMobile: string }) {
    const result = await this.referralService.processReferralCode(body.referralCode, body.userMobile);
    return result;
  }

  /**
   * Get referral information by code
   */
  @Get('code/:referralCode')
  async getReferralByCode(@Param('referralCode') referralCode: string) {
    const referral = await this.referralService.getReferralByCode(referralCode);
    return referral;
  }

  /**
   * Get user's referral information
   */
  @Get('user/:mobileNumber')
  async getUserReferralInfo(@Param('mobileNumber') mobileNumber: string) {
    const info = await this.referralService.getUserReferralInfo(mobileNumber);
    return info;
  }
}
