import { Controller, Post, Body, Get, Param, Query } from '@nestjs/common';
import { CommissionService, CommissionServiceRequest } from '../services/commission.service';
import { UserCommissionService } from '../services/user-commission.service';
import { Public } from '../utils/validators';

@Controller('commission')
export class CommissionController {
  constructor(
    private readonly commissionService: CommissionService,
    private readonly userCommissionService: UserCommissionService
  ) {}

  /**
   * Process commission service request
   */
  @Post('process')
  async processCommissionService(@Body() request: CommissionServiceRequest) {
    try {
      const result = await this.commissionService.processCommissionService(request);
      return {
        success: true,
        data: result,
        message: 'Commission service processed successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to process commission service'
      };
    }
  }

  /**
   * Handle commission service callback from Hubtel
   */
  @Post('callback')
  @Public()
  async handleCommissionCallback(@Body() callbackData: any) {
    try {
      console.log('COMMISSION CALLBACK RECEIVED:', JSON.stringify(callbackData, null, 2));
      await this.commissionService.handleCommissionCallback(callbackData);
      return {
        success: true,
        message: 'Commission callback processed successfully'
      };
    } catch (error) {
      console.error('COMMISSION CALLBACK ERROR:', error);
      return {
        success: false,
        message: error.message || 'Failed to process commission callback'
      };
    }
  }

  /**
   * Test commission callback processing
   * This is for debugging purposes
   */
  @Post('test-callback')
  async testCommissionCallback(@Body() testData: any) {
    try {
      console.log('TEST COMMISSION CALLBACK RECEIVED:', JSON.stringify(testData, null, 2));
      await this.commissionService.handleCommissionCallback(testData);
      return {
        success: true,
        message: 'Test commission callback processed successfully'
      };
    } catch (error) {
      console.error('TEST COMMISSION CALLBACK ERROR:', error);
      return {
        success: false,
        message: error.message || 'Failed to process test commission callback'
      };
    }
  }

  /**
   * Get user transaction history
   */
  @Get('history/:mobileNumber')
  async getUserTransactionHistory(@Param('mobileNumber') mobileNumber: string) {
    try {
      const history = await this.userCommissionService.getUserTransactionHistory(mobileNumber);
      return {
        success: true,
        data: history,
        message: 'Transaction history retrieved successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to get transaction history'
      };
    }
  }

  /**
   * Get user earnings by mobile number
   */
  @Get('earnings/:mobileNumber')
  async getUserEarnings(@Param('mobileNumber') mobileNumber: string) {
    try {
      const earnings = await this.userCommissionService.getUserEarnings(mobileNumber);
      return {
        success: true,
        data: earnings
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to get user earnings'
      };
    }
  }

  /**
   * Get commission statistics
   */
  @Get('statistics')
  async getCommissionStatistics() {
    try {
      const stats = await this.userCommissionService.getCommissionStatistics();
      return {
        success: true,
        data: stats
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to get commission statistics'
      };
    }
  }

  /**
   * Check commission service status
   */
  @Get('status/:clientReference')
  async checkCommissionStatus(@Param('clientReference') clientReference: string) {
    try {
      const result = await this.commissionService.checkCommissionStatus(clientReference);
      return {
        success: true,
        data: result,
        message: 'Commission status retrieved successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to check commission status'
      };
    }
  }

  /**
   * Process existing commission transactions
   * This endpoint can be used to backfill commission earnings for transactions that weren't processed
   */
  @Post('process-existing')
  async processExistingCommissionTransactions() {
    try {
      const result = await this.userCommissionService.processExistingCommissionTransactions();
      return {
        success: true,
        data: result,
        message: `Processed ${result.processed} transactions with ${result.errors} errors`
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to process existing commission transactions'
      };
    }
  }

}
