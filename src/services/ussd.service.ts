import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { FinalUssdReq } from "src/models/dto/hubtel/callback-ussd.dto";
import { HbEnums } from "src/models/dto/hubtel/hb-enums";
import { CheckOutItem, HBussdReq, HbUssdResObj } from "src/models/dto/hubtel/hb-ussd.dto";
import axios from "axios";
import { HbPayments } from "../models/dto/hubtel/callback-ussd.schema";
import { Voucher } from "../models/schemas/voucher.schema";
import { User } from "../models/schemas/user.shema";
import { sendVoucherSms } from "../utils/sendSMS";
import { Transactions } from "../models/schemas/transaction.schema";
import { VouchersService } from "./vouchers.service";

interface SessionState {
  service?: string;
  mobile?: string;
  name?: string;
  quantity?: number;
  flow?: "self" | "other";
  totalAmount?: number;
  assignedVoucherCodes?: string[];
}

@Injectable()
export class UssdService {
  private sessionMap = new Map<string, SessionState>();

  constructor(
    @InjectModel(HbPayments.name) private readonly hbPaymentsModel: Model<HbPayments>,
    @InjectModel(Transactions.name) private readonly transactionModel: Model<Transactions>,
    @InjectModel(Voucher.name) private readonly voucherModel: Model<Voucher>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly vouchersService: VouchersService,
  ) {}

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
      `Welcome to E-Wale \n1. BECE checker voucher\n2. WASSCE/ NovDec Checker - soon\n3. School Placement Checker - soon\n0. Contact us`,
      HbEnums.DATATYPE_INPUT,
      HbEnums.FIELDTYPE_NUMBER,
      HbEnums.RESPONSE
    );
  }

  private async handleResponse(req: HBussdReq) {
    let state = this.sessionMap.get(req.SessionId);
    if (!state) {
      return this.createResponse(
        req.SessionId,
        "Error",
        "Session expired or invalid. Please restart.",
        HbEnums.DATATYPE_DISPLAY,
        HbEnums.FIELDTYPE_TEXT,
        HbEnums.RELEASE
      );
    }
  
    switch (req.Sequence) {
      case 2:
        return this.handleServiceSelection(req, state);
      case 3:
        return this.handleBuyerType(req, state);
      case 4:
        return state.flow === "self"
          ? this.handleQuantityInput(req, state)
          : this.handleMobileNumber(req, state);
      case 5:
        return state.flow === "self"
          ? this.handleOrderDetails(req, state)
          : this.handleNameInput(req, state);
      case 6:
        return state.flow === "other"
          ? this.handleQuantityInput(req, state)
          : this.releaseSession(req.SessionId);
      case 7:
        return state.flow === "other"
          ? this.handleOrderDetails(req, state)
          : this.releaseSession(req.SessionId);
      default:
        return this.releaseSession(req.SessionId);
    }
  }
  

  private handleServiceSelection(req: HBussdReq, state: SessionState) {
    if (req.Message === "0") {
      return this.createResponse(
        req.SessionId,
        "Contact Us",
        "Phone: +233262195121\nEmail: guglextechnologies@gmail.com",
        HbEnums.DATATYPE_DISPLAY,
        HbEnums.FIELDTYPE_TEXT,
        HbEnums.RELEASE
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
        HbEnums.FIELDTYPE_NUMBER,
        HbEnums.RESPONSE
      );
    }

    return this.createResponse(
      req.SessionId,
      "Coming Soon",
      "This service is coming soon. Please select BECE checker voucher for now.",
      HbEnums.DATATYPE_DISPLAY,
      HbEnums.FIELDTYPE_TEXT,
      HbEnums.RELEASE
    );
  }

  private handleBuyerType(req: HBussdReq, state: SessionState) {
    if (req.Message === "1") {
      state.flow = "self";
      this.sessionMap.set(req.SessionId, state);
      return this.createResponse(
        req.SessionId,
        "Enter Quantity",
        "Enter quantity:",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_NUMBER,
        HbEnums.RESPONSE
      );
    } else if (req.Message === "2") {
      state.flow = "other";
      this.sessionMap.set(req.SessionId, state);
      return this.createResponse(
        req.SessionId,
        "Enter Mobile Number",
        "Enter other mobile number:",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_PHONE,
        HbEnums.RESPONSE
      );
    } else {
      return this.createResponse(
        req.SessionId,
        "Invalid Selection",
        "Please select 1 or 2",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_NUMBER,
        HbEnums.RESPONSE
      );
    }
  }

  private handleMobileNumber(req: HBussdReq, state: SessionState) {
    if (!req.Message || req.Message.length < 10) {
      return this.createResponse(
        req.SessionId,
        "Invalid Mobile Number",
        "Please enter a valid mobile number:",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_PHONE,
        HbEnums.RESPONSE
      );
    }

    state.mobile = req.Message;
    this.sessionMap.set(req.SessionId, state);
    return this.createResponse(
      req.SessionId,
      "Enter Name",
      "Enter recipient's name:",
      HbEnums.DATATYPE_INPUT,
      HbEnums.FIELDTYPE_TEXT,
      HbEnums.RESPONSE
    );
  }

  private handleNameInput(req: HBussdReq, state: SessionState) {
    if (!req.Message || req.Message.trim().length < 2) {
      return this.createResponse(
        req.SessionId,
        "Invalid Name",
        "Please enter a valid name (minimum 2 characters):",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_TEXT,
        HbEnums.RESPONSE
      );
    }

    state.name = req.Message.trim();
    this.sessionMap.set(req.SessionId, state);
    return this.createResponse(
      req.SessionId,
      "Enter Quantity",
      "Enter quantity:",
      HbEnums.DATATYPE_INPUT,
      HbEnums.FIELDTYPE_NUMBER,
      HbEnums.RESPONSE
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
        HbEnums.FIELDTYPE_NUMBER,
        HbEnums.RESPONSE
      );
    }

    state.quantity = quantity;
    state.totalAmount = this.getVoucherPrice() * quantity;
    this.sessionMap.set(req.SessionId, state);

    return this.createResponse(
      req.SessionId,
      "Order Details",
      `Details\nService: ${state.service}\nQuantity: ${quantity}\nAmount: GHS ${state.totalAmount.toFixed(
        2
      )}\n\n1. Confirm\n2. Cancel`,
      HbEnums.DATATYPE_INPUT,
      HbEnums.FIELDTYPE_NUMBER,
      HbEnums.RESPONSE
    );
  }

  private handleOrderDetails(req: HBussdReq, state: SessionState) {
    if (req.Message === "1") {
      return this.handlePaymentConfirmation(req, state);
    } else if (req.Message === "2") {
      return this.releaseSession(req.SessionId);
    } else {
      return this.createResponse(
        req.SessionId,
        "Invalid Selection",
        "Please select 1 or 2",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_NUMBER,
        HbEnums.RESPONSE
      );
    }
  }

  private async handlePaymentConfirmation(req: HBussdReq, state: SessionState) {
    if (req.Message !== "1") return this.releaseSession(req.SessionId);

    const total = state.totalAmount;

    const response: any = {
      SessionId: req.SessionId,
      Type: HbEnums.ADDTOCART,
      Label: "The request has been submitted. Please wait for a payment prompt soon!",
      Message: `Payment request for GHS ${total} has been submitted. Please wait for a payment prompt soon. If no prompt, Dial *170# → My Account → My approvals`,
      DataType: HbEnums.DATATYPE_DISPLAY,
      FieldType: HbEnums.FIELDTYPE_TEXT,
      Item: new CheckOutItem(state.service, 1, total)
    };

    // Assign vouchers through the voucher service
    try {
      const purchaseResult = await this.vouchersService.purchaseVouchers({
        quantity: state.quantity,
        mobile_number: req.Mobile,
        name: state.flow === "self" ? req.Mobile : state.name,
        flow: state.flow,
        bought_for_mobile: state.flow === "other" ? state.mobile : req.Mobile,
        bought_for_name: state.flow === "other" ? state.name : req.Mobile
      });
      
      // Store the assigned voucher codes in session state
      state.assignedVoucherCodes = purchaseResult.assigned_vouchers.map(v => v.voucher_code);
      
      // Store session state for later use
      this.sessionMap.set(req.SessionId, state);
      
    } catch (error) {
      console.error("Error assigning vouchers:", error);
      return this.createResponse(
        req.SessionId,
        "Error",
        "Unable to assign vouchers. Please try again.",
        HbEnums.DATATYPE_DISPLAY,
        HbEnums.FIELDTYPE_TEXT,
        HbEnums.RELEASE
      );
    }

    return JSON.stringify(response);
  }

  private async releaseSession(sessionId: string) {
    // Clean up session state
    this.sessionMap.delete(sessionId);
    return this.createResponse(
      sessionId,
      "Thank you",
      "Love from Guglex Technologies",
      HbEnums.DATATYPE_DISPLAY,
      HbEnums.FIELDTYPE_TEXT,
      HbEnums.RELEASE
    );
  }

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

    if (!req.OrderInfo || !req.OrderInfo.Payment) return;

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

        // Get the session state to retrieve assigned voucher codes
        const sessionState = this.sessionMap.get(req.SessionId);
        if (sessionState && sessionState.assignedVoucherCodes) {
          // Send SMS with all assigned voucher codes
          await sendVoucherSms(
            {
              mobile: sessionState.flow === "self" ? req.OrderInfo.CustomerMobileNumber : sessionState.mobile,
              name: req.OrderInfo.CustomerName,
              voucher_codes: sessionState.assignedVoucherCodes,
              flow: sessionState.flow,
              buyer_name: sessionState.flow === "other" ? req.OrderInfo.CustomerName : undefined,
              buyer_mobile: sessionState.flow === "other" ? req.OrderInfo.CustomerMobileNumber : undefined
            }
          );
          
          // Update the assigned vouchers to mark them as used and successful
          await this.voucherModel.updateMany(
            { voucher_code: { $in: sessionState.assignedVoucherCodes } },
            { 
              $set: { 
                used: true,
                isSuccessful: true,
                paymentStatus: req.OrderInfo.Status
              } 
            }
          );
        }

        await this.hbPaymentsModel.findOneAndUpdate(
          { SessionId: req.SessionId },
          { $set: { SessionId: req.SessionId, OrderId: req.OrderId } },
          { upsert: true, new: true }
        );
      } else {
        finalResponse.ServiceStatus = "failed";
      }

      await axios.post(`${process.env.HB_CALLBACK_URL}`, finalResponse, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${process.env.HUB_ACCESS_TOKEN}`
        }
      });
    } catch (error) {
      console.error("Error processing USSD callback:", error);
    }
  }

  private getVoucherPrice(): number {
    return 0.1;
  }
}
