import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { FinalUssdReq } from "src/models/dto/hubtel/callback-ussd.dto";
import { HbEnums } from "src/models/dto/hubtel/hb-enums";
import { HBussdReq, CheckOutItem } from "src/models/dto/hubtel/hb-ussd.dto";
import axios from "axios";
import { HbPayments } from "../models/dto/hubtel/callback-ussd.schema";
import { Voucher } from "../models/schemas/voucher.schema";
import { User } from "../models/schemas/user.shema";
import { sendVoucherSms } from "../utils/sendSMS";
import { Transactions } from "../models/schemas/transaction.schema";
import { VouchersService } from "./vouchers.service";

interface SessionState {
  service?: string;
  serviceType?: string; // 'result_checker', 'data_bundle', 'pay_bills', 'ecg_prepaid'
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

    // return this.createResponse(
    //   req.SessionId,
    //   "Welcome to E-Wale",
    //   `Welcome to E-Wale\n1. Results Voucher\n2. Data/Voice Bundles - soon\n3. Pay Bills - soon\n4. ECG Prepaid - soon\n0. Contact us`,
    //   HbEnums.DATATYPE_INPUT,
    //   HbEnums.FIELDTYPE_NUMBER,
    //   HbEnums.RESPONSE
    // );

    return this.createResponse(
      req.SessionId,
      "Welcome to E-Wale",
      `Welcome to E-Wale\n1. Results Voucher\n0. Contact us`,
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
        return this.handleMainMenuSelection(req, state);
      case 3:
        return this.handleServiceTypeSelection(req, state);
      case 4:
        return this.handleBuyerType(req, state);
      case 5:
        return state.flow === "self"
          ? this.handleQuantityInput(req, state)
          : this.handleMobileNumber(req, state);
      case 6:
        return state.flow === "self"
          ? this.handleOrderDetails(req, state)
          : this.handleNameInput(req, state);
      case 7:
        return state.flow === "other"
          ? this.handleQuantityInput(req, state)
          : this.releaseSession(req.SessionId);
      case 8:
        return state.flow === "other"
          ? this.handleOrderDetails(req, state)
          : this.releaseSession(req.SessionId);
      default:
        return this.releaseSession(req.SessionId);
    }
  }

  private handleMainMenuSelection(req: HBussdReq, state: SessionState) {
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
      state.serviceType = "result_checker";
      this.sessionMap.set(req.SessionId, state);
      // return this.createResponse(
      //   req.SessionId,
      //   "Result E-Checkers",
      //   "Select Result Checker:\n1. BECE Checker Voucher\n2. NovDec Checker - soon\n3. School Placement Checker - soon",
      //   HbEnums.DATATYPE_INPUT,
      //   HbEnums.FIELDTYPE_NUMBER,
      //   HbEnums.RESPONSE
      // );

      return this.createResponse(
        req.SessionId,
        "Result E-Checkers",
        "Select Result Checker:\n1. BECE Checker Voucher",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_NUMBER,
        HbEnums.RESPONSE
      );
    }

    // Handle other menu options (coming soon)
    if (["2", "3", "4"].includes(req.Message)) {
      const serviceNames = {
        "2": "Data/Voice Bundles",
        "3": "Pay Bills", 
        "4": "ECG Prepaid"
      };
      
      return this.createResponse(
        req.SessionId,
        "Coming Soon",
        `${serviceNames[req.Message]} service is coming soon. Please select Result E-Checkers for now.`,
        HbEnums.DATATYPE_DISPLAY,
        HbEnums.FIELDTYPE_TEXT,
        HbEnums.RELEASE
      );
    }

    return this.createResponse(
      req.SessionId,
      "Invalid Selection",
      "Please select a valid option (1-4 or 0)",
      HbEnums.DATATYPE_INPUT,
      HbEnums.FIELDTYPE_NUMBER,
      HbEnums.RESPONSE
    );
  }

  private handleServiceTypeSelection(req: HBussdReq, state: SessionState) {
    if (!["1", "2", "3"].includes(req.Message)) {
      return this.createResponse(
        req.SessionId,
        "Invalid Selection",
        "Please select 1, 2, or 3",
        HbEnums.DATATYPE_INPUT,
        HbEnums.FIELDTYPE_NUMBER,
        HbEnums.RESPONSE
      );
    }

    // Map service selection to service name
    const serviceMap = {
      "1": "BECE Checker Voucher",
      "2": "NovDec Checker", 
      "3": "School Placement Checker"
    };

    state.service = serviceMap[req.Message];
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

  private handleBuyerType(req: HBussdReq, state: SessionState) {
    if (req.Message === "1") {
      state.flow = "self";
      this.sessionMap.set(req.SessionId, state);
      return this.createResponse(
        req.SessionId,
        "Enter Quantity",
        "How many vouchers do you want to buy?",
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
      "How many vouchers do you want to buy?",
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
    state.totalAmount = this.getServicePrice(state.service) * quantity;
    this.sessionMap.set(req.SessionId, state);

    // Determine which mobile number to display based on flow
    const displayMobile = state.flow === "self" ? req.Mobile : state.mobile;
    
    return this.createResponse(
      req.SessionId,
      "Order Details",
      `Service: ${state.service}\nBought For: ${displayMobile}\nQuantity: ${quantity}\nAmount: GHS ${state.totalAmount.toFixed(
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

    // Store order details in session for later processing after payment
    // Don't assign vouchers yet - wait for successful payment
    try {
      // Just store the order details, don't process vouchers yet
      if (state.serviceType === "result_checker") {
        // Store order details for later voucher assignment
        state.totalAmount = total;
        this.sessionMap.set(req.SessionId, state);
      } else {
        // Handle other service types (future implementation)
        // For now, just store the order details
        state.totalAmount = total;
        this.sessionMap.set(req.SessionId, state);
      }
    } catch (error) {
      console.error("Error storing order details:", error);
      return this.createResponse(
        req.SessionId,
        "Error",
        "Unable to process request. Please try again.",
        HbEnums.DATATYPE_DISPLAY,
        HbEnums.FIELDTYPE_TEXT,
        HbEnums.RELEASE
      );
    }

    // AddToCart automatically triggers payment without showing reply prompts
    const response: any = {
      SessionId: req.SessionId,
      Type: HbEnums.ADDTOCART,
      Message: `Payment request for GHS ${total} has been submitted. Kindly approve the MOMO prompt. If no prompt, Dial *170# select 6) My Wallet 3) My Approvals`,
      Item: new CheckOutItem(state.service, 1, total),
      Label: "Payment Request Submitted",
      DataType: HbEnums.DATATYPE_DISPLAY,
      FieldType: HbEnums.FIELDTYPE_TEXT
    };
    // AddToCart type automatically prevents user input and triggers payment flow
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

        // Get the session state to process voucher assignment after successful payment
        const sessionState = this.sessionMap.get(req.SessionId);
        if (sessionState && sessionState.serviceType === "result_checker") {
          try {
            // Now assign vouchers after successful payment
            const purchaseResult = await this.vouchersService.purchaseVouchers({
              quantity: sessionState.quantity,
              mobile_number: req.OrderInfo.CustomerMobileNumber,
              name: sessionState.flow === "self" ? req.OrderInfo.CustomerMobileNumber : sessionState.name,
              flow: sessionState.flow,
              bought_for_mobile: sessionState.flow === "other" ? sessionState.mobile : req.OrderInfo.CustomerMobileNumber,
              bought_for_name: sessionState.flow === "other" ? sessionState.name : req.OrderInfo.CustomerMobileNumber
            });
            
            // Send SMS with all assigned voucher details (serial number and PIN)
            await sendVoucherSms(
              {
                mobile: sessionState.flow === "self" ? req.OrderInfo.CustomerMobileNumber : sessionState.mobile,
                name: req.OrderInfo.CustomerName,
                vouchers: purchaseResult.assigned_vouchers,
                flow: sessionState.flow,
                buyer_name: sessionState.flow === "other" ? req.OrderInfo.CustomerName : undefined,
                buyer_mobile: sessionState.flow === "other" ? req.OrderInfo.CustomerMobileNumber : undefined
              }
            );
            
            // Update the assigned vouchers to mark them as sold and successful
            await this.voucherModel.updateMany(
              { serial_number: { $in: purchaseResult.assigned_vouchers.map(v => v.serial_number) } },
              { 
                $set: { 
                  sold: true,
                  isSuccessful: true,
                  paymentStatus: req.OrderInfo.Status
                } 
              }
            );
          } catch (error) {
            console.error("Error assigning vouchers after payment:", error);
            // Continue with the process even if voucher assignment fails
          }
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

  private getServicePrice(service: string): number {
    // Price mapping for different services
    const priceMap = {
      "BECE Checker Voucher": 21,
      "NovDec Checker": 0.15,
      "School Placement Checker": 0.2,
      // Future services can be added here
      "Data Bundle": 5.0,
      "Voice Bundle": 3.0,
      "ECG Prepaid": 1.0
    };

    return priceMap[service] || 0.1; // Default price if service not found
  }
}
