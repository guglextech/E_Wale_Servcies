import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type CommissionTransactionLogDocument = CommissionTransactionLog & Document;

@Schema({ timestamps: true })
export class CommissionTransactionLog {
  @Prop({ required: true })
  SessionId: string;

  @Prop({ required: true })
  OrderId: string;

  @Prop({ required: true })
  clientReference: string;

  @Prop()
  hubtelTransactionId: string;

  @Prop()
  externalTransactionId: string;

  @Prop({ required: true })
  mobileNumber: string;

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
  description: string;

  @Prop({ type: Date })
  transactionDate: Date;

  @Prop()
  errorMessage: string;

  @Prop({ default: 'active' })
  logStatus: string;
}

export const CommissionTransactionLogSchema = SchemaFactory.createForClass(CommissionTransactionLog);

// Indexes for better query performance
CommissionTransactionLogSchema.index({ clientReference: 1 });
CommissionTransactionLogSchema.index({ hubtelTransactionId: 1 });
CommissionTransactionLogSchema.index({ mobileNumber: 1, createdAt: -1 });
CommissionTransactionLogSchema.index({ SessionId: 1 });
CommissionTransactionLogSchema.index({ OrderId: 1 });
CommissionTransactionLogSchema.index({ status: 1 });
CommissionTransactionLogSchema.index({ serviceType: 1 });
CommissionTransactionLogSchema.index({ createdAt: -1 });
