import { Controller, Get, Query, Res, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Controller('payment')
export class PaymentController {
  
  @Get('return')
  async paymentReturn(@Query() query: any, @Res() res: Response) {
    try {
      const { clientReference, status, transactionId } = query;
      return res.json({
        success: true,
        message: 'Payment completed successfully',
        data: {
          clientReference,
          status,
          transactionId,
          message: 'Your airtime will be delivered shortly'
        }
      });
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to process payment return',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Get('cancel')
  async paymentCancel(@Query() query: any, @Res() res: Response) {
    try {
        
      const { clientReference } = query;
      
      return res.json({
        success: false,
        message: 'Payment was cancelled',
        data: {
          clientReference,
          status: 'cancelled',
          message: 'You can try again anytime'
        }
      });
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to process payment cancellation',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
