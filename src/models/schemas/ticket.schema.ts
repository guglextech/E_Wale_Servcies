import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";
 

@Schema({ timestamps: true })
export class Ticket extends Document {
    
  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  user: Types.ObjectId;

  @Prop({ required: false })
  SessionId: string;

  @Prop({ required: true  })
  mobile: string;  

  @Prop({ required: false })
  name: string; 

  @Prop({ required: false })
  eventName: string;  

  @Prop({ required: true })
  packageType: string;  

  @Prop({ required: false })
  price: number;

  @Prop({ required: false })
  boughtForMobile : string;


  @Prop({ required: false })
  boughtForName : string;

  @Prop({ required: false, default: false })
  isVerifiedTicket: boolean;


  @Prop({ required: false })
  quantity: number;

  
  @Prop({ required: false })
  flow: string;

  @Prop({ required: false })
  paymentStatus: string;

  @Prop({ required: false })
  isSuccessful : false

  @Prop({ required: false })
  initialAmount: number;

  @Prop({ required: false })
  debitCharges : number;

  @Prop({ required: true, unique: true, default: () => generateTicketCode() })
  ticketCode: string;
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);


function generateTicketCode(): string {
    const randomNumber = Math.floor(10000 + Math.random() * 90000);
    const year = new Date().getFullYear().toString().slice(-2);
    return `DL-${randomNumber}-${year}`;
}