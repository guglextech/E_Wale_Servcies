export interface HBUssdCallBackReq {
    SessionId: string;
    OrderId:   string;
    ExtraData: ExtraData;
    OrderInfo: OrderInfo;
}

export interface ExtraData {
}

export interface OrderInfo {
    CustomerMobileNumber: string;
    CustomerEmail:        null;
    CustomerName:         string;
    Status:               string;
    OrderDate:            Date;
    Currency:             string;
    BranchName:           string;
    IsRecurring:          boolean;
    RecurringInvoiceId:   null;
    Subtotal:             number;
    Items:                Item[];
    Payment:              Payment;
}

export interface Item {
    ItemId:    string;
    Name:      string;
    Quantity:  number;
    UnitPrice: number;
}

export interface Payment {
    PaymentType:        string;
    AmountPaid:         number;
    AmountAfterCharges: number;
    PaymentDate:        Date;
    PaymentDescription: string;
    IsSuccessful:       boolean;
}

export class FinalUssdReq {
    SessionId:     string;
    OrderId:       string;
    ServiceStatus: string;
    MetaData:      null;
}
