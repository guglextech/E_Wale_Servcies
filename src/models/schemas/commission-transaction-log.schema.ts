import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type CommissionTransactionLogDocument = CommissionTransactionLog & Document;

@Schema({ timestamps: true })
export class CommissionTransactionLog {
  @Prop({ required: true })
  clientReference: string;

  @Prop()
  hubtelTransactionId: string;

  @Prop()
  externalTransactionId: string;

  @Prop({ required: true })
  mobileNumber: string;

  @Prop({ required: true })
  sessionId: string;

  @Prop({ required: true })
  serviceType: string; // 'bundle', 'airtime', 'tv_bill', 'utility'

  @Prop()
  network: string;

  @Prop()
  tvProvider: string;

  @Prop()
  utilityProvider: string;

  @Prop()
  bundleValue: string;

  @Prop({ type: Object })
  selectedBundle: object;

  @Prop()
  accountNumber: string;

  @Prop()
  meterNumber: string;

  @Prop({ required: true })
  amount: number;

  @Prop()
  commission: number;

  @Prop()
  charges: number;

  @Prop()
  amountAfterCharges: number;

  @Prop()
  currencyCode: string;

  @Prop()
  paymentMethod: string;

  @Prop({ required: true })
  status: string; // 'Paid', 'Unpaid', 'Pending'

  @Prop()
  isFulfilled: boolean;

  @Prop()
  responseCode: string;

  @Prop()
  message: string;

  @Prop()
  commissionServiceStatus: string; // 'delivered', 'failed', 'pending'

  @Prop()
  commissionServiceMessage: string;

  @Prop({ type: Date })
  transactionDate: Date;

  @Prop({ type: Date })
  commissionServiceDate: Date;

  @Prop()
  errorMessage: string;

  @Prop()
  retryCount: number;

  @Prop({ default: false })
  isRetryable: boolean;

  @Prop()
  lastRetryAt: Date;

  @Prop({ default: 'active' })
  logStatus: string; // 'active', 'archived', 'deleted'
}

export const CommissionTransactionLogSchema = SchemaFactory.createForClass(CommissionTransactionLog);

// Indexes for better query performance
CommissionTransactionLogSchema.index({ clientReference: 1 });
CommissionTransactionLogSchema.index({ hubtelTransactionId: 1 });
CommissionTransactionLogSchema.index({ mobileNumber: 1, createdAt: -1 });
CommissionTransactionLogSchema.index({ sessionId: 1 });
CommissionTransactionLogSchema.index({ status: 1 });
CommissionTransactionLogSchema.index({ commissionServiceStatus: 1 });
CommissionTransactionLogSchema.index({ serviceType: 1 });
CommissionTransactionLogSchema.index({ createdAt: -1 });
