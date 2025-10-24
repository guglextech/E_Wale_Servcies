import { Injectable, Logger } from '@nestjs/common';
import { ReferralService } from '../services/referral.service';

@Injectable()
export class ReferralInitializationService {
  private readonly logger = new Logger(ReferralInitializationService.name);

  constructor(private readonly referralService: ReferralService) {}

  /**
   * Initialize default referral codes on application startup
   */
  async initializeDefaultReferralCodes(): Promise<void> {
    try {
      this.logger.log('Initializing default referral codes...');
      await this.referralService.initializeDefaultReferralCodes();
      this.logger.log('Default referral codes initialized successfully');
    } catch (error) {
      this.logger.error('Error initializing default referral codes:', error);
    }
  }
}
