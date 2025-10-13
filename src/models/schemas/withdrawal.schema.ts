import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WithdrawalDocument = Withdrawal & Document;

@Schema({ timestamps: true })
export class Withdrawal {
  @Prop({ required: true, unique: true })
  clientReference: string;

  @Prop()
  hubtelTransactionId?: string;

  @Prop()
  externalTransactionId?: string;

  @Prop({ required: true })
  mobileNumber: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ default: 0 })
  charges: number;

  @Prop({ required: true })
  amountAfterCharges: number;

  @Prop({ default: 'GHS' })
  currencyCode: string;

  @Prop({ default: 'mobile_money' })
  paymentMethod: string;

  @Prop({ 
    enum: ['Pending', 'Completed', 'Failed'], 
    default: 'Pending' 
  })
  status: string;

  @Prop({ default: false })
  isFulfilled: boolean;

  @Prop()
  responseCode?: string;

  @Prop()
  message?: string;

  @Prop({ 
    enum: ['pending', 'delivered', 'failed'], 
    default: 'pending' 
  })
  commissionServiceStatus: string;

  @Prop({ default: Date.now })
  transactionDate: Date;

  @Prop({ default: 0 })
  retryCount: number;

  @Prop({ default: true })
  isRetryable: boolean;

  @Prop({ default: 'active' })
  logStatus: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const WithdrawalSchema = SchemaFactory.createForClass(Withdrawal);
