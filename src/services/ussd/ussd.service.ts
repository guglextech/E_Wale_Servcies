import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { HBussdReq } from "../../models/dto/hubtel/hb-ussd.dto";
import { HbEnums } from "../../models/dto/hubtel/hb-enums";
import { HbPayments } from "../../models/dto/hubtel/callback-ussd.schema";
import { FinalUssdReq } from "../../models/dto/hubtel/callback-ussd.dto";
import { Transactions } from "../../models/schemas/transaction.schema";
import axios from "axios";

// Import modular services
import { SessionManager } from "./session-manager";
import { ResponseBuilder } from "./response-builder";
import { UssdLoggingService } from "./logging.service";
import { PaymentProcessor } from "./payment-processor";
import { MenuHandler } from "./menu-handler";
import { ResultCheckerHandler } from "./handlers/result-checker.handler";
import { BundleHandler } from "./handlers/bundle.handler";
import { AirtimeHandler } from "./handlers/airtime.handler";
import { TVBillsHandler } from "./handlers/tv-bills.handler";
import { UtilityHandler } from "./handlers/utility.handler";
import { OrderDetailsHandler } from "./handlers/order-details.handler";

// Import business services
import { VouchersService } from "../vouchers.service";
import { AirtimeService } from "../airtime.service";
import { BundleService } from "../bundle.service";
import { TVBillsService } from "../tv-bills.service";
import { UtilityService } from "../utility.service";
import { TransactionStatusService } from "../transaction-status.service";
import { CommissionService } from "../commission.service";

// Import types
import { SessionState, UssdLogData } from "./types";
import { UtilityProvider } from "../../models/dto/utility.dto";

@Injectable()
export class UssdService {
  constructor(
    // Database models
    @InjectModel(HbPayments.name) private readonly hbPaymentsModel: Model<HbPayments>,
    @InjectModel(Transactions.name) private readonly transactionModel: Model<Transactions>,
    
    // Modular services
    private readonly sessionManager: SessionManager,
    private readonly responseBuilder: ResponseBuilder,
    private readonly loggingService: UssdLoggingService,
    private readonly paymentProcessor: PaymentProcessor,
    private readonly menuHandler: MenuHandler,
    private readonly resultCheckerHandler: ResultCheckerHandler,
    private readonly bundleHandler: BundleHandler,
    private readonly airtimeHandler: AirtimeHandler,
    private readonly tvBillsHandler: TVBillsHandler,
    private readonly utilityHandler: UtilityHandler,
    private readonly orderDetailsHandler: OrderDetailsHandler,
    
    // Business services
    private readonly transactionStatusService: TransactionStatusService,
    private readonly commissionService: CommissionService,
  ) {}

  /**
   * Main USSD request handler
   */
  async handleUssdRequest(req: HBussdReq): Promise<string> {
    try {
      if (!req.Type) {
        return this.responseBuilder.createErrorResponse(req.SessionId, 'Invalid request type');
      }
      
      switch (req.Type.toLowerCase()) {
        case HbEnums.INITIATION:
          return await this.handleInitiation(req);
        case HbEnums.RESPONSE:
          return await this.handleResponse(req);
        case HbEnums.ADDTOCART:
        default:
          return this.releaseSession(req.SessionId);
      }
    } catch (error) {
      console.error('USSD request error:', error);
      await this.loggingService.updateUssdLog(req.SessionId, 'failed', {
        errorMessage: error.message || 'Unknown error occurred'
      });
      return this.responseBuilder.createErrorResponse(req.SessionId, 'An error occurred. Please try again.');
    }
  }

  /**
   * Handle USSD initiation
   */
  private async handleInitiation(req: HBussdReq): Promise<string> {
    // Create new session
    this.sessionManager.createSession(req.SessionId);

    // Log the initial USSD dial
    await this.loggingService.logUssdInteraction({
      mobileNumber: req.Mobile,
      sessionId: req.SessionId,
      sequence: req.Sequence,
      message: req.Message,
      status: 'initiated',
      userAgent: 'USSD',
      deviceInfo: 'Mobile USSD',
      location: 'Ghana'
    });

    return this.responseBuilder.createNumberInputResponse(
      req.SessionId,
      "Welcome to E-Wale",
      "Welcome to E-Wale\n1. Results Voucher\n2. Data Bundle\n3. Airtime Top-Up\n4. Pay Bills\n5. Utility Service \n0. Contact us"
    );
  }

  /**
   * Handle USSD response
   */
  private async handleResponse(req: HBussdReq): Promise<string> {
    const state = this.sessionManager.getSession(req.SessionId);
    if (!state) {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Session expired or invalid. Please restart."
      );
    }

    // Log interaction
    await this.loggingService.logUssdInteraction({
      mobileNumber: req.Mobile,
      sessionId: req.SessionId,
      sequence: req.Sequence,
      message: req.Message,
      serviceType: state.serviceType,
      service: state.service,
      flow: state.flow,
      network: state.network,
      amount: state.amount,
      totalAmount: state.totalAmount,
      quantity: state.quantity,
      recipientName: state.name,
      recipientMobile: state.mobile,
      tvProvider: state.tvProvider,
      accountNumber: state.accountNumber,
      utilityProvider: state.utilityProvider,
      meterNumber: state.meterNumber,
      bundleValue: state.bundleValue,
      selectedBundle: state.selectedBundle,
      accountInfo: state.accountInfo,
      meterInfo: state.meterInfo,
      status: 'interaction',
      userAgent: 'USSD',
      deviceInfo: 'Mobile USSD',
      location: 'Ghana'
    });

    // Route to appropriate handler based on sequence
    switch (req.Sequence) {
      case 2:
        return await this.menuHandler.handleMainMenuSelection(req, state);
      case 3:
        const result = this.menuHandler.handleServiceTypeSelection(req, state);
        if (result === "BUNDLE_SELECTION_REQUIRED") {
          return await this.bundleHandler.handleNetworkSelection(req, state);
        }
        return result;
      case 4:
        return await this.handleStep4(req, state);
      case 5:
        return await this.handleStep5(req, state);
      case 6:
        return await this.handleStep6(req, state);
      case 7:
        return await this.handleStep7(req, state);
      case 8:
        return await this.handleStep8(req, state);
      case 9:
        return await this.handleStep9(req, state);
      case 10:
        return await this.handlePaymentConfirmation(req, state);
      default:
        return this.releaseSession(req.SessionId);
    }
  }

  /**
   * Handle step 4 - Service-specific input
   */
  private async handleStep4(req: HBussdReq, state: SessionState): Promise<string> {
    switch (state.serviceType) {
      case 'result_checker':
        return this.resultCheckerHandler.handleBuyerType(req, state);
      case 'data_bundle':
        return await this.handleBundleCategorySelection(req, state);
      case 'airtime_topup':
        return this.handleAirtimeMobileNumber(req, state);
      case 'pay_bills':
        return await this.handleTVAccountQuery(req, state);
      case 'utility_service':
        return await this.handleUtilityQuery(req, state);
      default:
        return this.responseBuilder.createErrorResponse(req.SessionId, 'Invalid service type');
    }
  }

  /**
   * Handle step 5 - Additional input
   */
  private async handleStep5(req: HBussdReq, state: SessionState): Promise<string> {
    switch (state.serviceType) {
      case 'result_checker':
        if (state.flow === 'self') {
          return this.resultCheckerHandler.handleQuantityInput(req, state);
        } else {
          return this.resultCheckerHandler.handleMobileNumber(req, state);
        }
      case 'data_bundle':
        return await this.handleBundleSelection(req, state);
      case 'airtime_topup':
        return this.handleAmountInput(req, state);
      case 'pay_bills':
        return this.handleTVAccountDisplay(req, state);
      case 'utility_service':
        return await this.handleUtilityStep5(req, state);
      default:
        return this.responseBuilder.createErrorResponse(req.SessionId, 'Invalid service type');
    }
  }

  /**
   * Handle step 6 - Order details
   */
  private async handleStep6(req: HBussdReq, state: SessionState): Promise<string> {
    switch (state.serviceType) {
      case 'result_checker':
        if (state.flow === 'self') {
          return this.resultCheckerHandler.handleOrderDetails(req, state);
        } else {
          return this.resultCheckerHandler.handleNameInput(req, state);
        }
      case 'data_bundle':
        return await this.handlePurchaseTypeSelection(req, state);
      case 'pay_bills':
        // For TV bills, handle amount input after account confirmation
        return this.handleTVAmountInput(req, state);
      case 'airtime_topup':
        // For airtime, trigger payment confirmation directly after order summary
        return await this.handlePaymentConfirmation(req, state);
      case 'utility_service':
        // For utility, handle email input for Ghana Water or amount input for ECG
        return await this.handleUtilityStep6(req, state);
      default:
        return this.responseBuilder.createErrorResponse(req.SessionId, 'Invalid service type');
    }
  }

  /**
   * Handle step 7 - Additional processing
   */
  private async handleStep7(req: HBussdReq, state: SessionState): Promise<string> {
    switch (state.serviceType) {
      case 'result_checker':
        if (state.flow === 'other') {
          return this.resultCheckerHandler.handleQuantityInput(req, state);
        } else {
          return this.releaseSession(req.SessionId);
        }
      case 'data_bundle':
        return this.handleBundleMobileNumber(req, state);
      case 'pay_bills':
        // For TV bills, trigger payment confirmation directly after order summary
        return await this.handlePaymentConfirmation(req, state);
      case 'airtime_topup':
        return this.releaseSession(req.SessionId);
      case 'utility_service':
        return await this.handleUtilityStep7(req, state);
      default:
        return this.responseBuilder.createErrorResponse(req.SessionId, 'Invalid service type');
    }
  }

  /**
   * Handle step 8 - Final processing
   */
  private async handleStep8(req: HBussdReq, state: SessionState): Promise<string> {
    switch (state.serviceType) {
      case 'result_checker':
        if (state.flow === 'other') {
          return this.resultCheckerHandler.handleOrderDetails(req, state);
        } else {
          return this.releaseSession(req.SessionId);
        }
      case 'data_bundle':
        return this.handleOrderDetails(req, state);
      case 'airtime_topup':
      case 'pay_bills':
        return this.releaseSession(req.SessionId);
      case 'utility_service':
        return await this.handleUtilityStep8(req, state);
      default:
        return this.responseBuilder.createErrorResponse(req.SessionId, 'Invalid service type');
    }
  }

  /**
   * Handle step 9 - Payment confirmation
   */
  private async handleStep9(req: HBussdReq, state: SessionState): Promise<string> {
    switch (state.serviceType) {
      case 'result_checker':
      case 'data_bundle':
        return await this.handlePaymentConfirmation(req, state);
      case 'airtime_topup':
        return this.releaseSession(req.SessionId);
      case 'utility_service':
        return await this.handleUtilityStep9(req, state);
      default:
        return this.responseBuilder.createErrorResponse(req.SessionId, 'Invalid service type');
    }
  }

  /**
   * Handle payment confirmation
   */
  private async handlePaymentConfirmation(req: HBussdReq, state: SessionState): Promise<string> {
    if (req.Message !== "1") {
      return this.releaseSession(req.SessionId);
    }

    const total = state.totalAmount;
    state.totalAmount = total;
    this.sessionManager.updateSession(req.SessionId, state);

    const serviceName = this.paymentProcessor.getServiceName(state);
    console.log("Payment Confirmation - ServiceName:", serviceName);
    console.log("Payment Confirmation - Total:", total);
    console.log("Payment Confirmation - Amount:", state.amount);
    console.log("Payment Confirmation - SessionId:", req.SessionId);
    console.log("Payment Confirmation - State:", state);
    
    return this.paymentProcessor.createPaymentRequest(req.SessionId, total, serviceName);
  }

  /**
   * Release session
   */
  private async releaseSession(sessionId: string): Promise<string> {
    await this.loggingService.updateUssdLog(sessionId, 'completed');
    this.sessionManager.deleteSession(sessionId);
    return this.responseBuilder.createThankYouResponse(sessionId);
  }

  /**
   * Handle USSD callback
   */
  async handleUssdCallback(req: HbPayments): Promise<void> {
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

      // Log payment completion
      await this.loggingService.updateUssdLog(req.SessionId, isSuccessful ? 'completed' : 'failed', {
        paymentStatus: req.OrderInfo.Status,
        orderId: req.OrderId,
        amountPaid: req.OrderInfo.Payment.AmountPaid,
        isSuccessful: isSuccessful
      });

      if (isSuccessful) {
        finalResponse.ServiceStatus = "success";

        // Get the session state to process after successful payment
        const sessionState = this.sessionManager.getSession(req.SessionId);
        if (sessionState) {
          // Process commission service for all service types
          try {
            await this.processCommissionServiceAfterPayment(sessionState, req.SessionId, req.OrderInfo);
          } catch (error) {
            console.error("Error processing commission service after payment:", error);
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

  /**
   * Process commission service after successful payment
   */
  private async processCommissionServiceAfterPayment(sessionState: SessionState, sessionId: string, orderInfo: any): Promise<void> {
    try {
      if (sessionState.serviceType === "result_checker") {
        // Handle voucher assignment (not a commission service)
        await this.resultCheckerHandler.processVoucherPurchase(sessionState, orderInfo);
      } else {
        // Handle commission services
        const commissionRequest = this.paymentProcessor.buildCommissionServiceRequest(
          sessionState, 
          sessionId, 
          `${process.env.HB_CALLBACK_URL}`
        );
        if (commissionRequest) {
          await this.commissionService.processCommissionService(commissionRequest);
        }
      }
    } catch (error) {
      console.error("Error processing commission service after payment:", error);
      throw error;
    }
  }

  // Implemented handlers for all services
  private async handleBundleSelection(req: HBussdReq, state: SessionState): Promise<string> {
    return await this.bundleHandler.handleBundleSelection(req, state);
  }

  private async handleBundleCategorySelection(req: HBussdReq, state: SessionState): Promise<string> {
    return await this.bundleHandler.handleBundleCategorySelection(req, state);
  }

  private async handlePurchaseTypeSelection(req: HBussdReq, state: SessionState): Promise<string> {
    return await this.bundleHandler.handlePurchaseTypeSelection(req, state);
  }

  private async handleBundleMobileNumber(req: HBussdReq, state: SessionState): Promise<string> {
    console.log("handleBundleMobileNumber", req, state);
    return await this.bundleHandler.handleBundleMobileNumber(req, state);
  }

  private async handleAirtimeMobileNumber(req: HBussdReq, state: SessionState): Promise<string> {
    return await this.airtimeHandler.handleAirtimeMobileNumber(req, state);
  }

  private async handleAmountInput(req: HBussdReq, state: SessionState): Promise<string> {
    return await this.airtimeHandler.handleAmountInput(req, state);
  }

  private async handleTVAccountQuery(req: HBussdReq, state: SessionState): Promise<string> {
    return await this.tvBillsHandler.handleTVAccountQuery(req, state);
  }

  private async handleTVAmountInput(req: HBussdReq, state: SessionState): Promise<string> {
    return await this.tvBillsHandler.handleTVAmountInput(req, state);
  }

  /**
   * Handle TV account display
   */
  private async handleTVAccountDisplay(req: HBussdReq, state: SessionState): Promise<string> {
    // Handle confirmation after account display
    if (req.Message === "1") {
      // User confirmed - proceed to amount input
      return this.responseBuilder.createDecimalInputResponse(
        req.SessionId,
        "Enter Amount",
        "Enter subscription amount:"
      );
    } else if (req.Message === "2") {
      // User cancelled
      return this.releaseSession(req.SessionId);
    } else {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Please select 1 to confirm or 2 to cancel"
      );
    }
  }

  private async handleUtilityQuery(req: HBussdReq, state: SessionState): Promise<string> {
    return await this.utilityHandler.handleUtilityQuery(req, state);
  }

  private async handleUtilityStep5(req: HBussdReq, state: SessionState): Promise<string> {
    console.log("handleUtilityStep5", req, state);
    return await this.utilityHandler.handleUtilityStep5(req, state);
  }

  private async handleUtilityAmountInput(req: HBussdReq, state: SessionState): Promise<string> {
    return await this.utilityHandler.handleUtilityAmountInput(req, state);
  }

  /**
   * Handle utility step 6 (confirmation for Ghana Water or amount input for ECG)
   */
  private async handleUtilityStep6(req: HBussdReq, state: SessionState): Promise<string> {
    if (state.utilityProvider === UtilityProvider.GHANA_WATER) {
      // For Ghana Water, handle confirmation after account display
      if (req.Message === "1") {
        // User confirmed - proceed to email input
        return this.responseBuilder.createResponse(
          req.SessionId,
          "Enter Email",
          "Enter your email address:",
          "input",
          "text"
        );
      } else if (req.Message === "2") {
        // User cancelled
        return this.releaseSession(req.SessionId);
      } else {
        return this.responseBuilder.createErrorResponse(
          req.SessionId,
          "Please select 1 to confirm or 2 to cancel"
        );
      }
    } else {
      // For ECG, handle amount input
      return await this.handleUtilityAmountInput(req, state);
    }
  }

  /**
   * Handle Ghana Water email input
   */
  private async handleGhanaWaterEmailInput(req: HBussdReq, state: SessionState): Promise<string> {
    const email = req.Message.trim();
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Please enter a valid email address"
      );
    }

    state.email = email;
    this.sessionManager.updateSession(req.SessionId, state);

    // Log email input
    await this.loggingService.logUssdInteraction({
      mobileNumber: req.Mobile,
      sessionId: req.SessionId,
      sequence: req.Sequence,
      message: req.Message,
      serviceType: state.serviceType,
      utilityProvider: state.utilityProvider,
      meterNumber: state.meterNumber,
      status: 'email_entered',
      userAgent: 'USSD',
      deviceInfo: 'Mobile USSD',
      location: 'Ghana'
    });

    return this.responseBuilder.createDecimalInputResponse(
      req.SessionId,
      "Enter Amount",
      "Enter top-up amount:"
    );
  }

  /**
   * Handle utility step 7 (email input for Ghana Water or confirmation for ECG)
   */
  private async handleUtilityStep7(req: HBussdReq, state: SessionState): Promise<string> {
    if (state.utilityProvider === UtilityProvider.GHANA_WATER) {
      // For Ghana Water, handle email input
      return await this.handleGhanaWaterEmailInput(req, state);
    } else {
      // For ECG, handle confirmation
      return await this.handleUtilityConfirmation(req, state);
    }
  }

  /**
   * Handle utility step 8 (amount input for Ghana Water or end session for ECG)
   */
  private async handleUtilityStep8(req: HBussdReq, state: SessionState): Promise<string> {
    if (state.utilityProvider === UtilityProvider.GHANA_WATER) {
      // For Ghana Water, handle amount input
      return await this.handleUtilityAmountInput(req, state);
    } else {
      // For ECG, end session (payment already triggered in Step 7)
      return this.releaseSession(req.SessionId);
    }
  }

  /**
   * Handle utility step 9 (confirmation for Ghana Water)
   */
  private async handleUtilityStep9(req: HBussdReq, state: SessionState): Promise<string> {
    if (state.utilityProvider === UtilityProvider.GHANA_WATER) {
      // For Ghana Water, handle confirmation
      return await this.handleUtilityConfirmation(req, state);
    } else {
      // For ECG, end session (payment already triggered in Step 7)
      return this.releaseSession(req.SessionId);
    }
  }

  /**
   * Handle utility confirmation
   */
  private async handleUtilityConfirmation(req: HBussdReq, state: SessionState): Promise<string> {
    if (req.Message === "1") {
      // User confirmed - trigger payment
      return await this.handlePaymentConfirmation(req, state);
    } else if (req.Message === "2") {
      // User cancelled
      return this.releaseSession(req.SessionId);
    } else {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Please select 1 to confirm or 2 to cancel"
      );
    }
  }

  private async handleOrderDetails(req: HBussdReq, state: SessionState): Promise<string> {
    return await this.orderDetailsHandler.handleOrderDetails(req, state);
  }

  /**
   * Check transaction status for USSD transactions
   */
  async checkUssdTransactionStatus(clientReference: string): Promise<any> {
    try {
      const statusResponse = await this.transactionStatusService.checkStatusByClientReference(clientReference);
      const summary = this.transactionStatusService.getTransactionStatusSummary(statusResponse);

      return {
        success: true,
        data: statusResponse,
        summary: summary,
        isSuccessful: this.transactionStatusService.isTransactionSuccessful(statusResponse),
        shouldRetry: this.transactionStatusService.shouldRetryTransaction(statusResponse),
        formattedDetails: this.transactionStatusService.getFormattedTransactionDetails(statusResponse)
      };
    } catch (error) {
      console.error('Error checking USSD transaction status:', error);
      return {
        success: false,
        message: error.message || 'Failed to check transaction status',
        shouldRetry: true
      };
    }
  }

  /**
   * Handle transaction status check for pending transactions
   */
  async handlePendingTransactionStatusCheck(): Promise<void> {
    try {
      await this.transactionStatusService.checkPendingTransactions();
      console.log('Pending transaction status check completed');
    } catch (error) {
      console.error('Error in pending transaction status check:', error);
    }
  }

  // Expose logging service methods for external use
  async getUssdLogsByMobile(mobileNumber: string, limit: number = 50) {
    return this.loggingService.getUssdLogsByMobile(mobileNumber, limit);
  }

  async getUssdLogsBySession(sessionId: string) {
    return this.loggingService.getUssdLogsBySession(sessionId);
  }

  async getUssdStatistics() {
    return this.loggingService.getUssdStatistics();
  }

  async getAllUssdLogs(page: number = 1, limit: number = 50, status?: string) {
    return this.loggingService.getAllUssdLogs(page, limit, status);
  }
}
