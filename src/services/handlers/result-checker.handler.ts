import { Injectable } from "@nestjs/common";
import { HBussdReq } from "../../models/dto/hubtel/hb-ussd.dto";
import { SessionState, ServiceType, FlowType } from "../ussd/types";
import { ResponseBuilder } from "../ussd/response-builder";
import { SessionManager } from "../ussd/session-manager";
import { UssdLoggingService } from "../ussd/logging.service";
import { PaymentProcessor } from "../ussd/payment-processor";
import { VouchersService } from "../vouchers.service";
import { sendVoucherSms } from "../../utils/sendSMS";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Voucher } from "../../models/schemas/voucher.schema";

@Injectable()
export class ResultCheckerHandler {
  constructor(
    private readonly responseBuilder: ResponseBuilder,
    private readonly sessionManager: SessionManager,
    private readonly loggingService: UssdLoggingService,
    private readonly paymentProcessor: PaymentProcessor,
    private readonly vouchersService: VouchersService,
    @InjectModel(Voucher.name) private readonly voucherModel: Model<Voucher>
  ) {}

  /**
   * Handle buyer type selection (self vs other)
   */
  handleBuyerType(req: HBussdReq, state: SessionState): string {
    if (req.Message === "1") {
      state.flow = FlowType.SELF;
      this.sessionManager.updateSession(req.SessionId, state);
      return this.responseBuilder.createNumberInputResponse(
        req.SessionId,
        "Enter Quantity",
        "How many vouchers do you want to buy?"
      );
    } else if (req.Message === "2") {
      state.flow = FlowType.OTHER;
      this.sessionManager.updateSession(req.SessionId, state);
      return this.responseBuilder.createPhoneInputResponse(
        req.SessionId,
        "Enter Mobile Number",
        "Enter other mobile number (e.g 0550982043):"
      );
    } else {
      return this.responseBuilder.createInvalidSelectionResponse(
        req.SessionId,
        "Please select 1 or 2"
      );
    }
  }

  /**
   * Handle mobile number input for other person
   */
  handleMobileNumber(req: HBussdReq, state: SessionState): string {
    // Validate and convert mobile number format
    const mobileValidation = this.validateMobileNumber(req.Message);
    if (!mobileValidation.isValid) {
      return this.responseBuilder.createPhoneInputResponse(
        req.SessionId,
        "Invalid Mobile Number",
        `Please enter a valid mobile number (e.g., 0550982043)`
      );
    }

    state.mobile = mobileValidation.convertedNumber;
    this.sessionManager.updateSession(req.SessionId, state);
    
    return this.responseBuilder.createResponse(
      req.SessionId,
      "Enter Name",
      "Enter recipient's name:",
      "INPUT",
      "TEXT"
    );
  }

  /**
   * Handle name input
   */
  handleNameInput(req: HBussdReq, state: SessionState): string {
    if (!req.Message || req.Message.trim().length < 2) {
      return this.responseBuilder.createResponse(
        req.SessionId,
        "Invalid Name",
        "Please enter a valid name (minimum 2 characters):",
        "INPUT",
        "TEXT"
      );
    }

    state.name = req.Message.trim();
    this.sessionManager.updateSession(req.SessionId, state);  
    return this.responseBuilder.createNumberInputResponse(
      req.SessionId,
      "Enter Quantity",
      "How many vouchers do you want to buy?"
    );
  }

  /**
   * Handle quantity input
   */
  handleQuantityInput(req: HBussdReq, state: SessionState): string {
    const quantity = parseInt(req.Message);
    if (isNaN(quantity) || quantity <= 0 || quantity > 100) {
      return this.responseBuilder.createNumberInputResponse(
        req.SessionId,
        "Invalid Quantity",
        "Please enter a valid quantity (1-80):"
      );
    }

    state.quantity = quantity;
    state.totalAmount = this.getServicePrice(state.service) * quantity;
    this.sessionManager.updateSession(req.SessionId, state);
    const displayMobile = state.flow === FlowType.SELF ? req.Mobile : (state.mobile || req.Mobile);

    return this.responseBuilder.createNumberInputResponse(
      req.SessionId,
      "Order Details",
      `Service: ${state.service}\nBought For: ${displayMobile}\nQuantity:${quantity}\nAmount: ${this.paymentProcessor.formatAmount(state.totalAmount)}\n\n1. Confirm\n2. Cancel`
    );
  }

  /**
   * Handle order details confirmation
   */
  async handleOrderDetails(req: HBussdReq, state: SessionState): Promise<string> {
    if (req.Message === "1") {
      return await this.handlePaymentConfirmation(req, state);
    } else if (req.Message === "2") {
      return this.responseBuilder.createThankYouResponse(req.SessionId);
    } else {
      return this.responseBuilder.createInvalidSelectionResponse(
        req.SessionId,
        "Please select 1 or 2"
      );
    }
  }

  /**
   * Handle payment confirmation
   */
  async handlePaymentConfirmation(req: HBussdReq, state: SessionState): Promise<string> {
    if (req.Message !== "1") {
      return this.responseBuilder.createThankYouResponse(req.SessionId);
    }

    const total = state.totalAmount;
    state.totalAmount = total;
    this.sessionManager.updateSession(req.SessionId, state);
    const serviceName = this.paymentProcessor.getServiceName(state);
    return this.paymentProcessor.createPaymentRequest(req.SessionId, total, serviceName);
  }

  /**
   * Process voucher purchase after successful payment
   */
  async processVoucherPurchase(sessionState: SessionState, orderInfo: any): Promise<void> {
    try {
      const purchaseResult = await this.vouchersService.purchaseVouchers({
        quantity: sessionState.quantity,
        mobile_number: orderInfo.CustomerMobileNumber,
        name: sessionState.flow === FlowType.SELF ? orderInfo.CustomerMobileNumber : sessionState.name,
        flow: sessionState.flow,
        bought_for_mobile: sessionState.flow === FlowType.OTHER ? sessionState.mobile : orderInfo.CustomerMobileNumber,
        bought_for_name: sessionState.flow === FlowType.OTHER ? sessionState.name : orderInfo.CustomerMobileNumber,
        voucherType: sessionState.service  
      });

    
      await sendVoucherSms({
        mobile: sessionState.flow === FlowType.SELF ? orderInfo.CustomerMobileNumber : sessionState.mobile,
        name: orderInfo.CustomerName,
        vouchers: purchaseResult.assigned_vouchers,
        flow: sessionState.flow,
        buyer_name: sessionState.flow === FlowType.OTHER ? orderInfo.CustomerName : undefined,
        buyer_mobile: sessionState.flow === FlowType.OTHER ? orderInfo.CustomerMobileNumber : undefined,
        voucherType: this.getVoucherTypeFromService(sessionState.service)
      });

      
      await this.voucherModel.updateMany(
        { serial_number: { $in: purchaseResult.assigned_vouchers.map(v => v.serial_number) } },
        {
          $set: {
            sold: true,
            isSuccessful: true,
            paymentStatus: orderInfo.Status
          }
        }
      );
    } catch (error) {
      console.error("Error processing voucher purchase:", error);
      throw error;
    }
  }

  /**
   * Get service price
   */
  private getServicePrice(service: string): number {
    const priceMap = {
      "BECE Checker Voucher": 20,
      "WASSCE / Nov/Dec Checker": 0.2
    };

    return priceMap[service] || 21;
  }

  /**
   * Get voucher type from service name
   */
  private getVoucherTypeFromService(service?: string): string {
    if (!service) return 'BECE';
    const serviceToVoucherType = {
      'BECE Checker Voucher': 'BECE',
      'WASSCE / Nov/Dec Checker': 'WASSCE'
    };
    return serviceToVoucherType[service] || 'BECE';
  }

  /**
   * Validate mobile number
   */
  private validateMobileNumber(mobile: string): { isValid: boolean; convertedNumber?: string; error?: string } {
    const cleaned = mobile.replace(/\D/g, '');
    if (cleaned.length === 10 && cleaned.startsWith('0')) {
      const converted = '233' + cleaned.substring(1);
      return { isValid: true, convertedNumber: converted };
    }
    
    if (cleaned.length === 12 && cleaned.startsWith('233')) {
      return { isValid: true, convertedNumber: cleaned };
    }
    
    return { 
      isValid: false, 
      error: 'Must be a valid mobile number (e.g 0550982043)' 
    };
  }
}
