import { Controller, Post, Body, Get, Query, HttpException, HttpStatus } from '@nestjs/common';
import { BundleService } from '../services/bundle.service';
import { BundleQueryDto, BundlePurchaseDto } from '../models/dto/bundle.dto';

@Controller('bundle')
export class BundleController {
  constructor(private readonly bundleService: BundleService) {}

  @Get('query')
  async queryBundles(@Query() queryDto: BundleQueryDto) {
    try {
      const result = await this.bundleService.queryBundles(queryDto);
      return {
        success: true,
        data: result,
        message: 'Bundle query successful'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to query bundles',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('payment-request')
  async createBundlePaymentRequest(@Body() bundleDto: BundlePurchaseDto) {
    try {
      const result = await this.bundleService.createBundlePaymentRequest(bundleDto);
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

  @Post('purchase')
  async purchaseBundle(@Body() bundleDto: BundlePurchaseDto) {
    try {
      // This now redirects to payment flow for backward compatibility
      const result = await this.bundleService.purchaseBundle(bundleDto);
      return {
        success: true,
        data: result,
        message: 'Payment request created successfully'
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

  @Post('payment-callback')
  async handlePaymentCallback(@Body() callbackData: any) {
    try {
      await this.bundleService.handlePaymentCallback(callbackData);
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

  @Post('callback')
  async handleCallback(@Body() callbackData: any) {
    try {
      await this.bundleService.handleBundleCallback(callbackData);
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
