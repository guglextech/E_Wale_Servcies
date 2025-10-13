import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { UserCommissionService } from '../services/user-commission.service';

@Controller('callback')
export class SendMoneyController {
  constructor(private readonly userCommissionService: UserCommissionService) {}

  @Post('send-money')
  async handleSendMoneyCallback(@Body() callbackData: any) {
    try {
      await this.userCommissionService.handleSendMoneyCallback(callbackData);
      return {
        success: true,
        message: 'Send money callback processed successfully'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to process send money callback',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
