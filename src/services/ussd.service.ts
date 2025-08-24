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
  package?: string;
  mobile?: string;
  name?: string;
  quantity?: number;
  flow?: 'self' | 'other';
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
   
    const availablePackages = [
      { code: "1", label: "VIP", price: 500 },
      { code: "2", label: "VVIP", price: 1000 },
    ];
  
    const packageOptions = availablePackages.map(pkg => `${pkg.code}. ${pkg.label} - GH₵ ${pkg.price}`).join("\n");

    return this.createResponse(
      req.SessionId,
      "Welcome Page",
      `Daddy Lumba Live in Koforidua.\n\nSelect Package:\n${packageOptions}\n\n0. Exit`,
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
      case 2: return this.handlePackageSelection(req, state);
      case 3: return this.handleBuyerType(req, state);
      case 4: return state.flow === 'self' ? this.handleQuantityInput(req, state) : this.handleMobileNumber(req, state);
      case 5: return state.flow === 'self' ? this.handlePaymentConfirmation(req, state) : this.handleNameInput(req, state);
      case 6: return state.flow === 'other' ? this.handleQuantityInput(req, state) : this.releaseSession(req.SessionId);
      case 7: return state.flow === 'other' ? this.handlePaymentConfirmation(req, state) : this.releaseSession(req.SessionId);
      default: return this.releaseSession(req.SessionId);
    }
  }

  private handlePackageSelection(req: HBussdReq, state: SessionState) {
    // Check for valid package codes (1 or 2) or exit (0)
    if (req.Message === "0") {
      return this.releaseSession(req.SessionId);
    }

    if (!["1", "2"].includes(req.Message)) {
      return this.createResponse(
        req.SessionId,
        "Invalid Selection",
        "Invalid choice. Please select 1, 2, or 0 to exit.",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_NUMBER
      );
    }

    state.package = req.Message;
    this.sessionMap.set(req.SessionId, state);
    return this.createResponse(
      req.SessionId,
      "Buying For",
      "Buy for:\n1. Myself\n2. Other\n\n0. Back to packages",
      HbEnums.DATATYPE_INPUT,
      HbEnums.FIELDTYPE_NUMBER
    );
  }

  private handleBuyerType(req: HBussdReq, state: SessionState) {
    if (req.Message === "0") {
      // Go back to package selection
      const initReq = { ...req, Sequence: 1, Type: 'initiation' as any };
      return this.handleInitiation(initReq);
    }

    if (req.Message === "1") {
      state.flow = 'self';
      this.sessionMap.set(req.SessionId, state);
      return this.createResponse(
        req.SessionId,
        "Ticket Quantity",
        "How many tickets would you like to buy?\n\nEnter quantity (1-100):",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_NUMBER
      );
    } else if (req.Message === "2") {
      state.flow = 'other';
      this.sessionMap.set(req.SessionId, state);
      return this.createResponse(
        req.SessionId,
        "Recipient Mobile",
        "Enter recipient's mobile number:\n\nFormat: 0241234567",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_PHONE
      );
    } else {
      return this.createResponse(
        req.SessionId,
        "Invalid Selection",
        "Please select 1, 2, or 0 to go back.",
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
        "Please enter a valid mobile number (minimum 10 digits):",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_PHONE
      );
    }

    state.mobile = req.Message;
    this.sessionMap.set(req.SessionId, state);
    return this.createResponse(
      req.SessionId,
      "Recipient Name",
      "Enter recipient's name:\n\nEnter full name:",
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
      "Ticket Quantity",
      "How many tickets would you like to buy?\n\nEnter quantity (1-100):",
      HbEnums.DATATYPE_INPUT,
      HbEnums.FIELDTYPE_NUMBER
    );
  }

  private handleQuantityInput(req: HBussdReq, state: SessionState) {
    const quantity = parseInt(req.Message);
    if (isNaN(quantity) || quantity <= 0 || quantity > 100) {
      return this.createResponse(
        req.SessionId,
        "Invalid Input",
        "Please enter a valid quantity between 1 and 100:",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_NUMBER
      );
    }

    state.quantity = quantity;
    this.sessionMap.set(req.SessionId, state);
    const total = this.getPackagePrice(state.package) * quantity;

    return this.createResponse(
      req.SessionId,
      "Confirm Purchase",
      `Order Summary:\n\nPackage: ${this.getPackageName(state.package)}\nQuantity: ${quantity}\nTotal Amount: GH₵ ${total.toFixed(2)}\n\n1. Confirm Purchase\n2. Cancel\n0. Go Back`,
      HbEnums.DATATYPE_INPUT,
      HbEnums.FIELDTYPE_NUMBER
    );
  }

  private async handlePaymentConfirmation(req: HBussdReq, state: SessionState) {
    if (req.Message === "0") {
      // Go back to quantity input
      return this.handleQuantityInput(req, state);
    }

    if (req.Message === "2") {
      return this.releaseSession(req.SessionId);
    }

    if (req.Message !== "1") {
      return this.createResponse(
        req.SessionId,
        "Invalid Selection",
        "Please select 1 to confirm, 2 to cancel, or 0 to go back.",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_NUMBER
      );
    }

    const total = this.getPackagePrice(state.package) * state.quantity;
    console.log("Total amount:", total);

    // Create the proper Hubtel response object
    const response = new HbUssdResObj();
    response.SessionId = req.SessionId;
    response.Type = HbEnums.ADDTOCART;
    response.Label = "Payment Request Submitted";
    response.Message = `Payment request for GH₵ ${total.toFixed(2)} has been submitted.\n\nPlease wait for a payment prompt soon.\n\nIf no prompt appears, dial *170# → My Account → My Approvals`;
    response.DataType = HbEnums.DATATYPE_DISPLAY;
    response.FieldType = HbEnums.FIELDTYPE_TEXT;

    // Set the checkout item for payment
    response.Item = new CheckOutItem(
      this.getPackageName(state.package),
      state.quantity,
      total
    );

    console.log("Payment response:", response);

    // Save ticket to database
    const newTicket = new this.ticketModel({
      user: req.SessionId, 
      SessionId: req.SessionId,
      mobile: req.Mobile,
      name: state.flow === "self" ? req.Mobile : state.name,
      packageType: this.getPackageName(state.package),
      quantity: state.quantity,
      flow: state.flow,
      initialAmount: total,
      boughtForMobile: state.flow === 'self' ? req.Mobile : state.mobile,
      boughtForName: state.flow === 'self' ? req.Mobile : state.name,
      paymentStatus: "pending",
      isSuccessful: false
    });

    await newTicket.save();
    
    // Return the response object directly (not JSON.stringify)
    return response;
  }

  private async releaseSession(sessionId: string) {
    this.sessionMap.delete(sessionId);
    return this.createResponse(sessionId, "Thank you", "Thank you for using our service. Goodbye!", HbEnums.DATATYPE_DISPLAY);
  }

  private createResponse(
    sessionId: string,
    label: string,
    message: string,
    dataType: string,
    fieldType: string = HbEnums.FIELDTYPE_TEXT) {

    return {
      SessionId: sessionId,
      Type: HbEnums.RESPONSE,
      Label: label,
      Message: message,
      DataType: dataType,
      FieldType: fieldType
    };
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

  getPackageName(packageCode: string): string {
    return (
      { "1": "VIP", "2": "VVIP" }[packageCode] || "Unknown"
    );
  }

  getPackagePrice(packageCode: string): number {
    return { "1": 500, "2": 1000 }[packageCode] || 0;
  }
}