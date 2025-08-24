import {Prop, Schema, SchemaFactory} from "@nestjs/mongoose";


export class Payment {
    @Prop()
    PaymentType: string;
    @Prop()
    AmountPaid: number;
    @Prop()
    AmountAfterCharges: number;
    @Prop()
    PaymentDate: string;
    @Prop()
    PaymentDescription: string;
    @Prop()
    IsSuccessful: boolean;
}

export class OrderInfo {
    @Prop()
    CustomerMobileNumber: string;
    @Prop()
    CustomerEmail: string;
    @Prop()
    CustomerName: string;
    @Prop()
    Status: string;
    @Prop()
    OrderDate: string;
    @Prop()
    Currency: string;
    @Prop()
    BranchName: string;
    @Prop()
    IsRecurring: boolean;
    @Prop()
    RecurringInvoiceId: string;
    @Prop()
    Subtotal: number;
    @Prop()
    Items: Item[];
    @Prop()
    Payment: Payment;
}

export class Item {
    @Prop()
    ItemId: string;
    @Prop()
    Name: string;
    @Prop()
    Quantity: number;
    @Prop()
    UnitPrice: number;
}

export class ExtraData {
}

@Schema()
export class HbPayments {
    @Prop()
    SessionId: string;
    @Prop()
    OrderId: string;
    @Prop()
    ExtraData?: ExtraData;
    @Prop()
    OrderInfo: OrderInfo;
    @Prop()
    shortCode: string;
}

export const HbPaymentsSchema = SchemaFactory.createForClass(HbPayments);