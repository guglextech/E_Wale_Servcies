import { Controller, Post, Body, Get, Query, HttpException, HttpStatus } from '@nestjs/common';
import { UtilityService } from '../services/utility.service';
import { ECGMeterQueryDto, GhanaWaterQueryDto, ECGTopUpDto, GhanaWaterTopUpDto } from '../models/dto/utility.dto';

@Controller('utility')
export class UtilityController {
  constructor(private readonly utilityService: UtilityService) {}

  @Get('ecg/query')
  async queryECGMeters(@Query() queryDto: ECGMeterQueryDto) {
    try {
      const result = await this.utilityService.queryECGMeters(queryDto);
      return {
        success: true,
        data: result,
        message: 'ECG meters query successful'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to query ECG meters',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Get('ghana-water/query')
  async queryGhanaWaterAccount(@Query() queryDto: GhanaWaterQueryDto) {
    try {
      const result = await this.utilityService.queryGhanaWaterAccount(queryDto);
      return {
        success: true,
        data: result,
        message: 'Ghana Water account query successful'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to query Ghana Water account',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('ecg/payment-request')
  async createECGTopUpPaymentRequest(@Body() ecgTopUpDto: ECGTopUpDto) {
    try {
      const result = await this.utilityService.createECGTopUpPaymentRequest(ecgTopUpDto);
      return {
        success: true,
        data: result,
        message: 'Payment request created successfully'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to create payment request',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('ghana-water/payment-request')
  async createGhanaWaterTopUpPaymentRequest(@Body() ghanaWaterTopUpDto: GhanaWaterTopUpDto) {
    try {
      const result = await this.utilityService.createGhanaWaterTopUpPaymentRequest(ghanaWaterTopUpDto);
      return {
        success: true,
        data: result,
        message: 'Payment request created successfully'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to create payment request',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('ecg/topup')
  async topUpECG(@Body() ecgTopUpDto: ECGTopUpDto) {
    try {
      // This now redirects to payment flow for backward compatibility
      const result = await this.utilityService.topUpECG(ecgTopUpDto);
      return {
        success: true,
        data: result,
        message: 'Payment request created successfully'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to process ECG top-up',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('ghana-water/topup')
  async topUpGhanaWater(@Body() ghanaWaterTopUpDto: GhanaWaterTopUpDto) {
    try {
      // This now redirects to payment flow for backward compatibility
      const result = await this.utilityService.topUpGhanaWater(ghanaWaterTopUpDto);
      return {
        success: true,
        data: result,
        message: 'Payment request created successfully'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to process Ghana Water top-up',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('payment-callback')
  async handlePaymentCallback(@Body() callbackData: any) {
    try {
      await this.utilityService.handlePaymentCallback(callbackData);
      return {
        success: true,
        message: 'Payment callback processed successfully'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to process payment callback',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('ecg/callback')
  async handleECGCallback(@Body() callbackData: any) {
    try {
      await this.utilityService.handleECGCallback(callbackData);
      return {
        success: true,
        message: 'ECG callback processed successfully'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to process ECG callback',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('ghana-water/callback')
  async handleGhanaWaterCallback(@Body() callbackData: any) {
    try {
      await this.utilityService.handleGhanaWaterCallback(callbackData);
      return {
        success: true,
        message: 'Ghana Water callback processed successfully'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to process Ghana Water callback',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
