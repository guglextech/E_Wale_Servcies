import { Controller, Post, Body, Get, Param, Query } from '@nestjs/common';
import { CommissionService, CommissionServiceRequest } from '../services/commission.service';

@Controller('commission')
export class CommissionController {
  constructor(private readonly commissionService: CommissionService) {}

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
   * Handle commission service callback
   */
  @Post('callback')
  async handleCommissionCallback(@Body() callbackData: any) {
    try {
      await this.commissionService.handleCommissionCallback(callbackData);
      return {
        success: true,
        message: 'Commission callback processed successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to process commission callback'
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
   * Get commission service statistics
   */
  @Get('statistics')
  async getCommissionStatistics() {
    try {
      const result = await this.commissionService.getCommissionStatistics();
      return {
        success: true,
        data: result,
        message: 'Commission statistics retrieved successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to get commission statistics'
      };
    }
  }
}
