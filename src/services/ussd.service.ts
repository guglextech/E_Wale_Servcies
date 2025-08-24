import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { FinalUssdReq } from "src/models/dto/hubtel/callback-ussd.dto";
import { HbEnums } from "src/models/dto/hubtel/hb-enums";
import { CheckOutItem, HBussdReq, HbUssdResObj } from "src/models/dto/hubtel/hb-ussd.dto";
import axios from 'axios';
import { HbPayments } from "../models/dto/hubtel/callback-ussd.schema";
import { Ticket } from "src/models/schemas/ticket.schema";
import { User } from "src/models/schemas/user.shema";
import { sendTicketSms } from "../utils/sendSMS";
import { Transactions } from "src/models/schemas/transaction.schema";

interface SessionState {
  service?: string;
  mobile?: string;
  name?: string;
  quantity?: number;
  flow?: 'self' | 'other';
  totalAmount?: number;
}

@Injectable()
export class UssdService {
  private sessionMap = new Map<string, SessionState>();

  constructor(
    @InjectModel(Ticket.name) private readonly ticketModel: Model<Ticket>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(HbPayments.name) private readonly hbPaymentsModel: Model<HbPayments>,
    @InjectModel(Transactions.name) private readonly transactionModel: Model<Transactions>,
  ) { }

  async handleUssdRequest(req: HBussdReq) {
    try {
      switch (req.Type.toLowerCase()) {
        case HbEnums.INITIATION:
          return this.handleInitiation(req);
        case HbEnums.RESPONSE:
          return this.handleResponse(req);
        case HbEnums.ADDTOCART:
        default:
          return this.releaseSession(req.SessionId);
      }
    } catch (error) {
      console.error(error);
      return this.releaseSession(req.SessionId);
    }
  }

  private async handleInitiation(req: HBussdReq) {
    this.sessionMap.set(req.SessionId, {});
   
    return this.createResponse(
      req.SessionId,
      "Welcome to Guglex Technologies",
      `I want buy result check e-voucher\n1. BECE checker voucher\n2. WASSCE/ NovDec Checker - soon\n3. School Placement Checker - soon\n0. Contact us`,
      HbEnums.DATATYPE_INPUT,
      HbEnums.FIELDTYPE_NUMBER
    );
  }

  private async handleResponse(req: HBussdReq) {
    let state = this.sessionMap.get(req.SessionId);
    if (!state) {
      return this.createResponse(
        req.SessionId,
        "Error",
        "Session expired or invalid. Please restart.",
        HbEnums.DATATYPE_DISPLAY
      );
    }

    switch (req.Sequence) {
      case 2: return this.handleServiceSelection(req, state);
      case 3: return this.handleBuyerType(req, state);
      case 4: return state.flow === 'self' ? this.handleQuantityInput(req, state) : this.handleMobileNumber(req, state);
      case 5: return state.flow === 'self' ? this.handleOrderDetails(req, state) : this.handleNameInput(req, state);
      case 6: return state.flow === 'other' ? this.handleQuantityInput(req, state) : this.releaseSession(req.SessionId);
      case 7: return state.flow === 'other' ? this.handleOrderDetails(req, state) : this.releaseSession(req.SessionId);
      case 8: return this.handlePaymentConfirmation(req, state);
      default: return this.releaseSession(req.SessionId);
    }
  }

  private handleServiceSelection(req: HBussdReq, state: SessionState) {
    if (req.Message === "0") {
      return this.createResponse(
        req.SessionId,
        "Contact Us",
        "Phone: +233262195121\nEmail: guglextechnologies@gmail.com",
        HbEnums.DATATYPE_DISPLAY
      );
    }

    if (req.Message === "1") {
      state.service = "BECE checker voucher";
      this.sessionMap.set(req.SessionId, state);
      return this.createResponse(
        req.SessionId,
        "Buying For",
        "Buy for:\n1. Buy for me\n2. For other",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_NUMBER
      );
    }

    // For other services that are coming soon
    return this.createResponse(
      req.SessionId,
      "Coming Soon",
      "This service is coming soon. Please select BECE checker voucher for now.",
      HbEnums.DATATYPE_INPUT,
      HbEnums.FIELDTYPE_NUMBER
    );
  }

  private handleBuyerType(req: HBussdReq, state: SessionState) {
    if (req.Message === "1") {
      state.flow = 'self';
      this.sessionMap.set(req.SessionId, state);
      return this.createResponse(
        req.SessionId,
        "Enter Quantity",
        "Enter quantity:",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_NUMBER
      );
    } else if (req.Message === "2") {
      state.flow = 'other';
      this.sessionMap.set(req.SessionId, state);
      return this.createResponse(
        req.SessionId,
        "Enter Mobile Number",
        "Enter other mobile number:",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_PHONE
      );
    } else {
      return this.createResponse(
        req.SessionId,
        "Invalid Selection",
        "Please select 1 or 2",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_NUMBER
      );
    }
  }

  private handleMobileNumber(req: HBussdReq, state: SessionState) {
    // Basic mobile number validation
    if (!req.Message || req.Message.length < 10) {
      return this.createResponse(
        req.SessionId,
        "Invalid Mobile Number",
        "Please enter a valid mobile number:",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_PHONE
      );
    }

    state.mobile = req.Message;
    this.sessionMap.set(req.SessionId, state);
    return this.createResponse(
      req.SessionId,
      "Enter Name",
      "Enter recipient's name:",
      HbEnums.DATATYPE_INPUT,
      HbEnums.FIELDTYPE_TEXT
    );
  }

  private handleNameInput(req: HBussdReq, state: SessionState) {
    if (!req.Message || req.Message.trim().length < 2) {
      return this.createResponse(
        req.SessionId,
        "Invalid Name",
        "Please enter a valid name (minimum 2 characters):",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_TEXT
      );
    }

    state.name = req.Message.trim();
    this.sessionMap.set(req.SessionId, state);
    return this.createResponse(
      req.SessionId,
      "Enter Quantity",
      "Enter quantity:",
      HbEnums.DATATYPE_INPUT,
      HbEnums.FIELDTYPE_NUMBER
    );
  }

  private handleQuantityInput(req: HBussdReq, state: SessionState) {
    const quantity = parseInt(req.Message);
    if (isNaN(quantity) || quantity <= 0 || quantity > 100) {
      return this.createResponse(
        req.SessionId,
        "Invalid Quantity",
        "Please enter a valid quantity (1-100):",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_NUMBER
      );
    }

    state.quantity = quantity;
    state.totalAmount = this.getVoucherPrice() * quantity;
    this.sessionMap.set(req.SessionId, state);

    return this.createResponse(
      req.SessionId,
      "Order Details",
      `Details\nService: ${state.service}\nQuantity: ${quantity}\nAmount: GHS ${state.totalAmount.toFixed(2)}\n\n1. Confirm\n2. Cancel`,
      HbEnums.DATATYPE_INPUT,
      HbEnums.FIELDTYPE_NUMBER
    );
  }

  private handleOrderDetails(req: HBussdReq, state: SessionState) {
    if (req.Message === "1") {
      return this.createResponse(
        req.SessionId,
        "Confirm Payment",
        `Confirm prompt for payment\n\nService: ${state.service}\nQuantity: ${state.quantity}\nTotal Amount: GHS ${state.totalAmount.toFixed(2)}\n\n1. Confirm payment prompt\n2. Cancel`,
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_NUMBER
      );
    } else if (req.Message === "2") {
      return this.releaseSession(req.SessionId);
    } else {
      return this.createResponse(
        req.SessionId,
        "Invalid Selection",
        "Please select 1 or 2",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_NUMBER
      );
    }
  }

  private async handlePaymentConfirmation(req: HBussdReq, state: SessionState) {
    console.log(req, "HANDLE PAYMENT CONFIRMATION");
    if (req.Message !== "1") return this.releaseSession(req.SessionId);

    const total = state.totalAmount;
    console.log(total, "TOTAL AMOUNT:::");

    // Use the same structure as your working code
    const response = new HbUssdResObj();
    response.SessionId = req.SessionId;
    response.Type = HbEnums.ADDTOCART;
    response.Label = "The request has been submitted. Please wait for a payment prompt soon!";
    response.Message = `Payment request for GHS ${total} has been submitted. Please wait for a payment prompt soon. If no prompt, Dial *170#- My Account-My approvals`;
    response.DataType = HbEnums.DATATYPE_DISPLAY;

    // Use CheckOutItem constructor like working code
    response.Item = new CheckOutItem(
      state.service,
      1,  // Use 1 like in working code, not state.quantity
      total
    );

    console.log(response.Item, " RESPONSE");

    // Save ticket to database
    const newTicket = new this.ticketModel({
      user: req.SessionId, 
      SessionId: req.SessionId,
      mobile: req.Mobile,
      name: state.flow === "self" ? req.Mobile : state.name,
      packageType: state.service,
      quantity: state.quantity,
      flow: state.flow,
      initialAmount: total,
      boughtForMobile: state.flow === 'self' ? req.Mobile : state.mobile,
      boughtForName: state.flow === 'self' ? req.Mobile : state.name,
      paymentStatus: "pending",
      isSuccessful: false
    });

    await newTicket.save();
    
    // Don't delete session here - let Hubtel manage the session
    // this.sessionMap.delete(req.SessionId);
    
    // Return JSON string like working code
    return JSON.stringify(response);
  }

  private async releaseSession(sessionId: string) {
    this.sessionMap.delete(sessionId);
    return this.createResponse(sessionId, "Thank you", "Love from Guglex Technologies", HbEnums.DATATYPE_DISPLAY, HbEnums.FIELDTYPE_TEXT);
  }


  // FIXED createResponse
  private createResponse(
    sessionId: string,
    label: string,
    message: string,
    dataType: string,
    fieldType: string = HbEnums.FIELDTYPE_TEXT,
    type: string = HbEnums.RESPONSE 
  ) {
    return JSON.stringify({
      SessionId: sessionId,
      Type: type,   
      Label: label,
      Message: message,
      DataType: dataType,
      FieldType: fieldType
    });
  }


  async handleUssdCallback(req: HbPayments) {
    console.error("LOGGING CALLBACK::::::", req);

    if (!req.OrderInfo || !req.OrderInfo.Payment) {
      console.error("LOGGING::::::", req);
      return;
    }
 
    let finalResponse = new FinalUssdReq();
    finalResponse.SessionId = req.SessionId;
    finalResponse.OrderId = req.OrderId;
    finalResponse.MetaData = null;

    const transaction = new this.transactionModel({
      SessionId: req.SessionId,
      OrderId: req.OrderId,
      ExtraData: req.ExtraData,
      CustomerMobileNumber: req.OrderInfo.CustomerMobileNumber,
      CustomerEmail: req.OrderInfo.CustomerEmail,
      CustomerName: req.OrderInfo.CustomerName,
      Status: req.OrderInfo.Status,
      OrderDate: req.OrderInfo.OrderDate,
      Currency: req.OrderInfo.Currency,
      BranchName: req.OrderInfo.BranchName,
      IsRecurring: req.OrderInfo.IsRecurring,
      RecurringInvoiceId: req.OrderInfo.RecurringInvoiceId,
      Subtotal: req.OrderInfo.Subtotal,
      Items: req.OrderInfo.Items,
      PaymentType: req.OrderInfo.Payment.PaymentType,
      AmountPaid: req.OrderInfo.Payment.AmountPaid,
      AmountAfterCharges: req.OrderInfo.Payment.AmountAfterCharges,
      PaymentDate: req.OrderInfo.Payment.PaymentDate,
      PaymentDescription: req.OrderInfo.Payment.PaymentDescription,
      IsSuccessful: req.OrderInfo.Payment.IsSuccessful
    });

    await transaction.save();
   
    try {
      const isSuccessful = req.OrderInfo.Payment.IsSuccessful;

      if (isSuccessful) {
        finalResponse.ServiceStatus = "success";

        // Update ticket status
        const ticket = await this.ticketModel.findOneAndUpdate(
          { "SessionId": req.SessionId },
          { 
            $set: {
              paymentStatus: req.OrderInfo.Status,
              isSuccessful: isSuccessful,
              name: req.OrderInfo.CustomerName
            }
          },
        );

        if (!ticket) {
          console.log(`Ticket not found for SessionId: ${req.SessionId}`);
          return;
        }

        // Get the updated ticket
        const updatedTicket = await this.ticketModel.findOne({ SessionId: req.SessionId });
        if (!updatedTicket) {
          console.log(`No tickets found for SessionId: ${req.SessionId}`);
          return;
        }

        // Send SMS with voucher details
        await sendTicketSms(updatedTicket);

        // Update Hubtel payments record
        await this.hbPaymentsModel.findOneAndUpdate(
          { "SessionId": req.SessionId },
          {
            $set: {
              SessionId: req.SessionId,
              OrderId: req.OrderId,
            },
          },
          { upsert: true, new: true }
        );
      }

      // Send response to Hubtel
      const response = await axios.post(`${process.env.HB_CALLBACK_URL}`, finalResponse, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${process.env.HUB_ACCESS_TOKEN}`
        }
      });
      console.log("Response from Hubtel:", response.status);
    } catch (error) {
      console.error("Error processing USSD callback:", error);
    }
  }

  private getVoucherPrice(): number {
    // BECE checker voucher price
    return 19.50; // GHS 5.00 per voucher
  }
}