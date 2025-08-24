import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

@Schema({ timestamps: true })
export class Voucher extends Document {
  @Prop({ required: true, unique: true, index: true })
  voucher_code: string;

  @Prop({ required: true, default: Date.now })
  date: Date;

  @Prop({ required: true, default: false })
  used: boolean;

  @Prop({ required: false })
  mobile_number_assigned: string;

  @Prop({ required: false })
  assigned_date: Date;

  // Additional voucher fields for purchase tracking
  @Prop({ type: Types.ObjectId, ref: "User", required: false })
  user: Types.ObjectId;

  @Prop({ required: false })
  SessionId: string;

  @Prop({ required: false })
  mobile: string;  

  @Prop({ required: false })
  name: string; 

  @Prop({ required: false })
  eventName: string;  

  @Prop({ required: false })
  packageType: string;  

  @Prop({ required: false })
  price: number;

  @Prop({ required: false })
  boughtForMobile: string;

  @Prop({ required: false })
  boughtForName: string;

  @Prop({ required: false, default: false })
  isVerifiedVoucher: boolean;

  @Prop({ required: false })
  quantity: number;

  @Prop({ required: false })
  flow: string;

  @Prop({ required: false })
  paymentStatus: string;

  @Prop({ required: false, default: false })
  isSuccessful: boolean;

  @Prop({ required: false })
  initialAmount: number;

  @Prop({ required: false })
  debitCharges: number;
}

export const VoucherSchema = SchemaFactory.createForClass(Voucher);
