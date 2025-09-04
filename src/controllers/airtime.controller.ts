import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { AirtimeService } from '../services/airtime.service';
import { AirtimeTopUpDto, AirtimeCallbackDto } from '../models/dto/airtime.dto';

@Controller('airtime')
export class AirtimeController {
  constructor(private readonly airtimeService: AirtimeService) {}

  @Post('deliver')
  async deliverAirtime(@Body() airtimeDto: AirtimeTopUpDto) {
    try {
      const result = await this.airtimeService.deliverAirtime(airtimeDto);
      return {
        success: true,
        data: result,
        message: 'Airtime delivery initiated successfully'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to deliver airtime',
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
