import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({ timestamps: true })  
export class Transactions extends Document {
  
 
  @Prop({ required: true })
  SessionId: string;

  @Prop({ required: true })
  OrderId: string;

  @Prop({ type: Object, default: {} }) 
  ExtraData: Record<string, any>;

  @Prop({ required: true })
  CustomerMobileNumber: string;

  @Prop()
  CustomerEmail: string;

  @Prop()
  CustomerName: string;

  @Prop({ required: true })
  Status: string;

  @Prop({ required: true })
  OrderDate: Date;

  @Prop({ required: true })
  Currency: string;

  @Prop()
  BranchName: string;

  @Prop({ default: false })
  IsRecurring: boolean;

  @Prop()
  RecurringInvoiceId: string;

  @Prop({ required: true })
  Subtotal: number;

  @Prop({ type: Array, default: [] })
  Items: {
    ItemId: string;
    Name: string;
    Quantity: number;
    UnitPrice: number;
  }[];

  @Prop({ required: true })
  PaymentType: string;

  @Prop({ required: true })
  AmountPaid: number;

  @Prop()
  AmountAfterCharges: number;

  @Prop({ required: true })
  PaymentDate: Date;

  @Prop()
  PaymentDescription: string;

  @Prop({ required: true })
  IsSuccessful: boolean;
}

export const TransactionsSchema = SchemaFactory.createForClass(Transactions);
