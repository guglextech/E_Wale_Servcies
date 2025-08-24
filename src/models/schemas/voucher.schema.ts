import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

@Schema({ timestamps: true })
export class Voucher extends Document {
  @Prop({ required: true, unique: true })
  voucher_code: string;

  @Prop({ required: true, default: Date.now })
  date: Date;

  @Prop({ required: true, default: false })
  used: boolean;

  @Prop({ required: false })
  mobile_number_assigned: string;

  @Prop({ type: Types.ObjectId, ref: "Ticket", required: false })
  ticket: Types.ObjectId;

  @Prop({ required: false })
  assigned_date: Date;
}

export const VoucherSchema = SchemaFactory.createForClass(Voucher);
