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
        message: 'ECG meter query successful'
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

  @Post('ecg/topup')
  async topUpECG(@Body() topUpDto: ECGTopUpDto) {
    try {
      const result = await this.utilityService.topUpECG(topUpDto);
      return {
        success: true,
        data: result,
        message: 'ECG top-up request submitted successfully'
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
  async topUpGhanaWater(@Body() topUpDto: GhanaWaterTopUpDto) {
    try {
      const result = await this.utilityService.topUpGhanaWater(topUpDto);
      return {
        success: true,
        data: result,
        message: 'Ghana Water top-up request submitted successfully'
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

  @Post('callback')
  async handleCallback(@Body() callbackData: any) {
    try {
      await this.utilityService.handleUtilityCallback(callbackData);
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
