import {Prop, Schema, SchemaFactory} from "@nestjs/mongoose";

export interface CommissionTransaction {
  transactionId: string;
  clientReference: string;
  externalTransactionId: string;
  amount: number;
  commission: number;
  serviceType: string;
  network?: string;
  tvProvider?: string;
  utilityProvider?: string;
  transactionDate: Date;
  status: 'pending' | 'completed' | 'failed';
}

@Schema()
export class User {
  @Prop()
  userId: string;

  @Prop({required: true, type: String, unique: true})
  username: string;

  @Prop()
  password: string;

  @Prop()
  role: string;

  @Prop()
  permissions: [];

  @Prop()
  userDescription: string;

  @Prop()
  firstname: string;

  @Prop()
  lastname: string;

  @Prop()
  photo: string;

  @Prop()
  phone: string;

  @Prop()
  authType: string;

  // Commission tracking fields
  @Prop({ type: [Object], default: [] })
  commissionTransactions: CommissionTransaction[];

  @Prop({ default: 0 })
  totalEarnings: number;

  @Prop({ default: 0 })
  availableBalance: number;

  @Prop({ default: 0 })
  totalWithdrawn: number;

  @Prop({ default: 0 })
  pendingWithdrawals: number;

  // Referral fields
  @Prop({ required: false })
  referralCode: string;

  @Prop({ required: false })
  referredBy: string;

  @Prop({ default: 0 })
  referralEarnings: number;

  @Prop({ default: 0 })
  totalReferrals: number;

  @Prop()
  updatedAt: Date
  
  @Prop()
  createdAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
