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
   * Handle commission service callback from Hubtel
   * This endpoint receives callbacks automatically from Hubtel commission services
   */
  @Public()
  @Post('callback')
  async handleCommissionCallback(@Body() callbackData: any) {
    try {
      console.log(`=== COMMISSION CONTROLLER CALLBACK RECEIVED ===`);
      console.log(`Callback data: ${JSON.stringify(callbackData, null, 2)}`);
      
      await this.commissionService.processCommissionServiceCallback(callbackData);
      
      console.log(`=== COMMISSION CONTROLLER CALLBACK PROCESSED ===`);
      return {
        success: true,
        message: 'Commission callback processed successfully'
      };
    } catch (error) {
      console.error(`=== COMMISSION CONTROLLER CALLBACK ERROR ===`);
      console.error(`Error: ${error.message}`);
      console.error(`Stack: ${error.stack}`);
      return {
        success: false,
        message: error.message || 'Failed to process commission callback'
      };
    }
  }

  /**
   * Manually update commission for a specific transaction
   * This endpoint can be used to fix transactions that didn't get proper commission processing
   */
  @Post('update-commission')
  async updateTransactionCommission(@Body() body: { clientReference: string; commissionAmount: number }) {
    try {
      await this.userCommissionService.updateTransactionCommission(body.clientReference, body.commissionAmount);
      return {
        success: true,
        message: 'Commission updated successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to update commission'
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
      // This method is no longer needed since earnings are calculated directly from transactions
      return {
        success: true,
        message: 'Earnings are now calculated directly from transaction history. No processing needed.'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to process existing commission transactions'
      };
    }
  }

}
