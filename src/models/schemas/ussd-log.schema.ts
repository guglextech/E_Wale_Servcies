import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type UssdLogDocument = UssdLog & Document;

@Schema({ timestamps: true })
export class UssdLog {
  @Prop({ required: true })
  mobileNumber: string;

  @Prop({ required: true })
  sessionId: string;

  @Prop()
  sequence: number;

  @Prop()
  message: string;

  @Prop()
  serviceType: string;

  @Prop()
  service: string;

  @Prop()
  flow: string;

  @Prop()
  network: string;

  @Prop()
  amount: number;

  @Prop()
  totalAmount: number;

  @Prop()
  quantity: number;

  @Prop()
  recipientName: string;

  @Prop()
  recipientMobile: string;

  @Prop()
  tvProvider: string;

  @Prop()
  accountNumber: string;

  @Prop()
  utilityProvider: string;

  @Prop()
  meterNumber: string;

  @Prop()
  bundleValue: string;

  @Prop({ type: Object })
  selectedBundle: object;

  @Prop({ type: Object })
  accountInfo: object;

  @Prop({ type: Object })
  meterInfo: object;

  @Prop({ default: 'initiated' })
  status: string; // initiated, completed, failed, cancelled

  @Prop()
  errorMessage: string;

  @Prop()
  ipAddress: string;

  @Prop()
  userAgent: string;

  @Prop()
  location: string;

  @Prop()
  deviceInfo: string;

  @Prop({ type: Date, default: Date.now })
  dialedAt: Date;

  @Prop({ type: Date })
  completedAt: Date;

  @Prop()
  duration: number; // in seconds

  @Prop()
  isSuccessful: boolean;

  @Prop()
  paymentStatus: string;

  @Prop()
  orderId: string;

  @Prop()
  clientReference: string;
}

export const UssdLogSchema = SchemaFactory.createForClass(UssdLog);

// Index for better query performance
UssdLogSchema.index({ mobileNumber: 1, dialedAt: -1 });
UssdLogSchema.index({ sessionId: 1 });
UssdLogSchema.index({ status: 1 });
UssdLogSchema.index({ serviceType: 1 });
