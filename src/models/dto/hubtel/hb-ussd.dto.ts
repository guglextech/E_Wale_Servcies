import { IsEmail, IsNotEmpty } from "class-validator";
import { HbEnums } from "./hb-enums";

export class HBussdReq {
    /**
     * This stipulates the type of G.S request. Possible values are:
     * “Initiation” – Indicates the beginning of a session (first message in the session).
     * “Response” – indicates the subsequent response in an already existing session.
     * “Timeout” – indicates that the session was cancelled by the user.
     **/
    Type:        HbEnums;
    Mobile:      string;
    SessionId:   string;
    ServiceCode: string;
    /**
     * Represents the actual text entered by the User.
     * For USSD Channels, this will represent the USSD
     * string entered by the subscriber during initiation.
     */
    Message:     any;
    Operator:    string;
    Sequence:    number;
    ClientState: string;
    /**
     * This represents the actual platform channel being used for
     * the Programmable service session. Possible values:
     * "USSD", "Webstore", "Hubtel-App".
     * Note: Betting companies wishing to be on
     * the Hubtel App and Webstore must make provisions to handle all three platforms.
     */
    Platform:    string;
}

export interface HBUssdRes {
    SessionId:   string;
    Type:        string;
    Message:     string;
    Label:       string;
    ClientState: string;
    DataType:    string;
    FieldType:   string;
}

export class HbUssdResObj implements HBUssdRes {
    ClientState: string;
    DataType: string;
    FieldType: string;
    @IsNotEmpty()
    Label: string;
    @IsNotEmpty()
    Message: string;
    @IsNotEmpty()
    SessionId: string;
    Type: string;
    /**
     * Contains data that is sent during
     * the AddToCart type response for payment
     * from the User. For other response types,
     * it must be empty.
     */
    Item: CheckOutItem
}

export class CheckOutItem {
    ItemName: string;
    Qty:      number;
    Price:    number;

    constructor(ItemName: string, Qty: number, Price: number) {
        this.ItemName = ItemName;
        this.Qty = Qty;
        this.Price = Price;
    }
}