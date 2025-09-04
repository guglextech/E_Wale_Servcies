import { Controller, Post, Body, Get, Query, HttpException, HttpStatus } from '@nestjs/common';
import { TVBillsService } from '../services/tv-bills.service';
import { TVAccountQueryDto, TVBillPaymentDto } from '../models/dto/tv-bills.dto';

@Controller('tv-bills')
export class TVBillsController {
  constructor(private readonly tvBillsService: TVBillsService) {}

  @Get('query')
  async queryAccount(@Query() queryDto: TVAccountQueryDto) {
    try {
      const result = await this.tvBillsService.queryAccount(queryDto);
      return {
        success: true,
        data: result,
        message: 'Account query successful'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to query account',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('pay')
  async payTVBill(@Body() tvBillDto: TVBillPaymentDto) {
    try {
      const result = await this.tvBillsService.payTVBill(tvBillDto);
      return {
        success: true,
        data: result,
        message: 'TV bill payment processed successfully'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to process TV bill payment',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('callback')
  async handleCallback(@Body() callbackData: any) {
    try {
      await this.tvBillsService.handleTVBillCallback(callbackData);
      return {
        success: true,
        message: 'Callback processed successfully'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to process callback',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
