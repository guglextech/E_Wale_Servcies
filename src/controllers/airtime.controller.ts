import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { AirtimeService } from '../services/airtime.service';
import { AirtimeTopUpDto, BundlePurchaseDto, AirtimeCallbackDto } from '../models/dto/airtime.dto';

@Controller('airtime')
export class AirtimeController {
  constructor(private readonly airtimeService: AirtimeService) {}

  @Post('topup')
  async purchaseAirtime(@Body() airtimeDto: AirtimeTopUpDto) {
    try {
      const result = await this.airtimeService.purchaseAirtime(airtimeDto);
      return {
        success: true,
        data: result,
        message: 'Airtime top-up request submitted successfully'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to process airtime top-up',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('bundle')
  async purchaseBundle(@Body() bundleDto: BundlePurchaseDto) {
    try {
      const result = await this.airtimeService.purchaseBundle(bundleDto);
      return {
        success: true,
        data: result,
        message: 'Bundle purchase request submitted successfully'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to process bundle purchase',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('callback')
  async handleCallback(@Body() callbackData: AirtimeCallbackDto) {
    try {
      await this.airtimeService.handleAirtimeCallback(callbackData);
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
