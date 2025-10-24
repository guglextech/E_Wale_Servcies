import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

@Schema({ timestamps: true })
export class Referral extends Document {
  @Prop({ required: true, unique: true, index: true })
  referralCode: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  mobileNumber: string;

  @Prop({ type: Types.ObjectId, ref: "User", required: false })
  userId: Types.ObjectId;

  @Prop({ default: 0 })
  totalReferrals: number;

  @Prop({ default: 0 })
  totalEarnings: number;

  @Prop({ type: [String], default: [] })
  referredUsers: string[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const ReferralSchema = SchemaFactory.createForClass(Referral);
