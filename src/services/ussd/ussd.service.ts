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
import { ResultCheckerHandler } from "../handlers/result-checker.handler";
import { BundleHandler } from "../handlers/bundle.handler";
import { AirtimeHandler } from "../handlers/airtime.handler";
import { TVBillsHandler } from "../handlers/tv-bills.handler";
import { UtilityHandler } from "../handlers/utility.handler";
import { EarningHandler } from "../handlers/earning.handler";

// Import business services
import { TransactionStatusService } from "../transaction-status.service";
import { CommissionService } from "../commission.service";

// Import types
import { SessionState, UssdLogData } from "./types";
import { UtilityProvider } from "../../models/dto/utility.dto";
import { CommissionTransactionLogData } from "../../models/dto/commission-transaction-log.dto";
import { CommissionServiceRequest } from "../commission.service";

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
    private readonly earningHandler: EarningHandler,
    
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
      await this.loggingService.updateSessionStatus(req.SessionId, 'failed', {
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
    const state = this.sessionManager.createSession(req.SessionId);

    // Log the initial USSD session
    await this.loggingService.logSessionState(req.SessionId, req.Mobile, state, 'initiated');

    return this.responseBuilder.createNumberInputResponse(
      req.SessionId,
      "Welcome to E-Wale",
      "Welcome to E-Wale\n1. Buy Airtime\n2. Data/Voice Bundle\n3. Pay Bills\n4. Utilities\n5. Results Vouchers\n6. Earnings\n0. Contact us"
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

    // Log current session state
    await this.loggingService.logSessionState(req.SessionId, req.Mobile, state, 'active');

    // Route to appropriate handler based on sequence
    switch (req.Sequence) {
      case 2:
        return await this.menuHandler.handleMainMenuSelection(req, state);
      case 3:
        const result = await this.menuHandler.handleServiceTypeSelection(req, state);
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
        // Handle bundle category selection
        return await this.bundleHandler.handleBundleCategorySelection(req, state);
      case 'airtime_topup':
        return await this.airtimeHandler.handleBuyerTypeSelection(req, state);
      case 'pay_bills':
        return await this.handleTVAccountQuery(req, state);
      case 'utility_service':
        // For ECG, handle meter type selection; for Ghana Water, handle mobile number
        if (state.utilityProvider === UtilityProvider.ECG) {
          return await this.utilityHandler.handleECGMeterTypeSelection(req, state);
        } else {
          return await this.handleUtilityQuery(req, state);
        }
      case 'earning':
        // Handle withdrawal confirmation for earning service
        if (state.earningFlow === 'withdrawal') {
          return await this.earningHandler.handleWithdrawalConfirmation(req, state);
        }
        return this.releaseSession(req.SessionId);
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
        // Check if user is in category selection mode (after going back to categories)
        if (state.isInCategorySelectionMode) {
          // Clear the flag and handle as category selection
          state.isInCategorySelectionMode = false;
          this.sessionManager.updateSession(req.SessionId, state);
          return await this.handleBundleCategorySelection(req, state);
        }
        // Handle bundle selection
        return await this.handleBundleSelection(req, state);
      case 'airtime_topup':
        if (state.flow === 'other') {
          return await this.airtimeHandler.handleAirtimeMobileNumber(req, state);
        } else {
          return await this.airtimeHandler.handleAmountInput(req, state);
        }
      case 'pay_bills':
        return this.handleTVAccountDisplay(req, state);
      case 'utility_service':
        // For ECG with meter type selection, handle sub-option selection
        if (state.utilityProvider === UtilityProvider.ECG && state.meterType && !state.utilitySubOption) {
          return await this.utilityHandler.handleECGSubOptionSelection(req, state);
        } else {
          return await this.handleUtilityStep5(req, state);
        }
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
        // Handle "99" navigation for going back to categories
        if (req.Message === "99") {
          return await this.bundleHandler.handleBackToCategories(req, state);
        }
       
        // Check if user is in category selection mode (after going back to categories)
        if (state.isInCategorySelectionMode) {
          // Clear the flag and handle as category selection
          state.isInCategorySelectionMode = false;
          this.sessionManager.updateSession(req.SessionId, state);
          return await this.handleBundleCategorySelection(req, state);
        }
        // Handle buy for selection (Self/Other)
        return await this.handleBuyForSelection(req, state);
      case 'pay_bills':
        if (state.subscriptionType === 'renew') {
          return await this.handlePaymentConfirmation(req, state);
        } else {
          return this.handleTVAmountInput(req, state);
        }
      case 'airtime_topup':
        if (state.flow === 'other') {
          return await this.airtimeHandler.handleAmountInput(req, state);
        } else {
          // For airtime, trigger payment confirmation directly after order summary
          return await this.handlePaymentConfirmation(req, state);
        }
      case 'utility_service':
        // For ECG with prepaid topup, handle mobile number input first
        if (state.utilityProvider === UtilityProvider.ECG && state.utilitySubOption === 'topup' && !state.mobile) {
          return await this.handleUtilityQuery(req, state);
        } else if (state.utilityProvider === UtilityProvider.GHANA_WATER && state.ghanaWaterService && !state.meterNumber) {
          // For Ghana Water, handle account number input after service selection
          return await this.utilityHandler.handleGhanaWaterQuery(req, state);
        } else if (state.utilityProvider === UtilityProvider.GHANA_WATER && state.ghanaWaterService === 'pay_bill' && state.meterNumber && !state.amount) {
          // For Ghana Water, handle payment amount input after account lookup
          return await this.handleUtilityAmountInput(req, state);
        } else {
          // For utility, handle email input for Ghana Water or amount input for ECG
          return await this.handleUtilityStep6(req, state);
        }
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
        // Handle "99" navigation for going back to categories
        if (req.Message === "99") {
          return await this.bundleHandler.handleBackToCategories(req, state);
        }
        // Check if user is in category selection mode (after going back to categories)
        if (state.isInCategorySelectionMode) {
          // Clear the flag and handle as category selection
          state.isInCategorySelectionMode = false;
          this.sessionManager.updateSession(req.SessionId, state);
          return await this.handleBundleCategorySelection(req, state);
        }
        // Handle bundle selection if user is viewing bundle packages
        if (!state.selectedBundle && state.bundleGroups && state.currentGroupIndex !== undefined) {
          return await this.handleBundleSelection(req, state);
        }
        if (state.flow === 'other') {
          // Handle mobile number input for "other" flow
          return await this.handleOtherMobileNumber(req, state);
        } else {
          // Handle order summary confirmation for "self" flow
          if (req.Message === "1") {
            return await this.handlePaymentConfirmation(req, state);
          } else if (req.Message === "2") {
            return this.releaseSession(req.SessionId);
          } else {
            return this.responseBuilder.createErrorResponse(
              req.SessionId,
              "Please select 1 to confirm or 2 to cancel"
            );
          }
        }
      case 'airtime_topup':
        // For airtime "other" flow, trigger payment confirmation after amount input
        return await this.handlePaymentConfirmation(req, state);
      case 'pay_bills':
        return await this.handlePaymentConfirmation(req, state);
      case 'utility_service':
        // For ECG with prepaid topup, handle meter selection if mobile was just entered
        if (state.utilityProvider === UtilityProvider.ECG && state.utilitySubOption === 'topup' && state.mobile && !state.selectedMeter) {
          return await this.handleUtilityStep5(req, state);
        } else {
          return await this.handleUtilityStep7(req, state);
        }
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
        // Handle "99" navigation for going back to categories
        if (req.Message === "99") {
          return await this.bundleHandler.handleBackToCategories(req, state);
        }
        // Check if user is in category selection mode (after going back to categories)
        if (state.isInCategorySelectionMode) {
          // Clear the flag and handle as category selection
          state.isInCategorySelectionMode = false;
          this.sessionManager.updateSession(req.SessionId, state);
          return await this.handleBundleCategorySelection(req, state);
        }
        // Handle bundle selection if user is viewing bundle packages
        if (!state.selectedBundle && state.bundleGroups && state.currentGroupIndex !== undefined) {
          return await this.handleBundleSelection(req, state);
        }
        // Handle buy-for selection if user has selected a bundle but no flow yet
        if (state.selectedBundle && !state.flow) {
          return await this.handleBuyForSelection(req, state);
        }
        if (state.flow === 'other') {
          // Handle order summary confirmation for "other" flow
          if (req.Message === "1") {
            return await this.handlePaymentConfirmation(req, state);
          } else if (req.Message === "2") {
            return this.releaseSession(req.SessionId);
          } else {
            return this.responseBuilder.createErrorResponse(
              req.SessionId,
              "Please select 1 to confirm or 2 to cancel"
            );
          }
        } else {
          // Bundle flow ends at step 7 for "self" flow
          return this.releaseSession(req.SessionId);
        }
      case 'airtime_topup':
      case 'pay_bills':
        return this.releaseSession(req.SessionId);
      case 'utility_service':
        // For ECG with prepaid topup, handle amount input after meter selection
        if (state.utilityProvider === UtilityProvider.ECG && state.utilitySubOption === 'topup' && state.selectedMeter && !state.amount) {
          return await this.handleUtilityAmountInput(req, state);
        } else {
          return await this.handleUtilityStep8(req, state);
        }
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
        return await this.handlePaymentConfirmation(req, state);
      case 'data_bundle':
        // Handle "99" navigation for going back to categories
        if (req.Message === "99") {
          return await this.bundleHandler.handleBackToCategories(req, state);
        }
        // Check if user is in category selection mode (after going back to categories)
        if (state.isInCategorySelectionMode) {
          // Clear the flag and handle as category selection
          state.isInCategorySelectionMode = false;
          this.sessionManager.updateSession(req.SessionId, state);
          return await this.handleBundleCategorySelection(req, state);
        }
        // Bundle flow ends at step 7, this should not be reached
        return this.releaseSession(req.SessionId);
      case 'airtime_topup':
        return this.releaseSession(req.SessionId);
      case 'utility_service':
        // For ECG with prepaid topup, handle payment confirmation after amount input
        if (state.utilityProvider === UtilityProvider.ECG && state.utilitySubOption === 'topup' && state.amount) {
          return await this.handlePaymentConfirmation(req, state);
        } else {
          return await this.handleUtilityStep9(req, state);
        }
      default:
        return this.responseBuilder.createErrorResponse(req.SessionId, 'Invalid service type');
    }
  }

  /**
   * Handle payment confirmation
   */
  private async handlePaymentConfirmation(req: HBussdReq, state: SessionState): Promise<string> {
    // Route to appropriate handler based on service type
    switch (state.serviceType) {
      case 'result_checker':
        return await this.resultCheckerHandler.handlePaymentConfirmation(req, state);
      case 'pay_bills':
        return await this.tvBillsHandler.handlePaymentConfirmation(req, state);
      case 'data_bundle':
        // Check if user is in category selection mode (after going back to categories)
        if (state.isInCategorySelectionMode) {
          // Clear the flag and handle as category selection
          state.isInCategorySelectionMode = false;
          this.sessionManager.updateSession(req.SessionId, state);
          return await this.handleBundleCategorySelection(req, state);
        }
        // Use default payment confirmation for data bundle
        if (req.Message !== "1") {
          return this.releaseSession(req.SessionId);
        }
        // break;
        // Fall through to default payment processing
      case 'voice_bundle':
      case 'airtime_topup':
      case 'utility_service':
      default:
        // Use default payment confirmation for other services
        if (req.Message !== "1") {
          return this.releaseSession(req.SessionId);
        }

        const total = state.totalAmount;
        state.totalAmount = total;
        this.sessionManager.updateSession(req.SessionId, state);

        const serviceName = this.paymentProcessor.getServiceName(state);
        return this.paymentProcessor.createPaymentRequest(req.SessionId, total, serviceName);
    }
  }

  /**
   * Release session
   */
  private async releaseSession(sessionId: string): Promise<string> {
    await this.loggingService.updateSessionStatus(sessionId, 'completed');
    this.sessionManager.deleteSession(sessionId);
    return this.responseBuilder.createThankYouResponse(sessionId);
  }

  /**
   * Handle USSD callback
   */
  async handleUssdCallback(req: HbPayments): Promise<void> {
    console.error("LOGGING CALLBACK AFTER PAYMENT :::", req);

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
      await this.loggingService.updateSessionStatus(req.SessionId, isSuccessful ? 'completed' : 'failed', {
        paymentStatus: req.OrderInfo.Status,
        orderId: req.OrderId,
        amountPaid: req.OrderInfo.Payment.AmountPaid,
        isSuccessful: isSuccessful
      });

      // Log commission transaction
      await this.logCommissionTransaction(req, isSuccessful);

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
        await this.resultCheckerHandler.processVoucherPurchase(sessionState, orderInfo);
      } else {
        const commissionRequest = this.paymentProcessor.buildCommissionServiceRequest(sessionState,  sessionId, `${process.env.HB_CALLBACK_URL}`);
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

  private async handleBuyForSelection(req: HBussdReq, state: SessionState): Promise<string> {
    // Always handle the selection since we're in step 6
    return await this.bundleHandler.handleBuyForSelection(req, state);
  }

  private async handleOtherMobileNumber(req: HBussdReq, state: SessionState): Promise<string> {
    return await this.bundleHandler.handleBundleMobileNumber(req, state);
  }



  private async handleTVAccountQuery(req: HBussdReq, state: SessionState): Promise<string> {
    return await this.tvBillsHandler.handleTVAccountQuery(req, state);
  }

  private async handleTVAmountInput(req: HBussdReq, state: SessionState): Promise<string> {
    return await this.tvBillsHandler.handleTVAmountInput(req, state);
  }

  /**
   * Handle TV account display - now handles subscription options
   */
  private async handleTVAccountDisplay(req: HBussdReq, state: SessionState): Promise<string> {
    // Route to TV bills handler for subscription option selection
    return await this.tvBillsHandler.handleSubscriptionOptionSelection(req, state);
  }

  private async handleUtilityQuery(req: HBussdReq, state: SessionState): Promise<string> {
    return await this.utilityHandler.handleUtilityQuery(req, state);
  }

  private async handleUtilityStep5(req: HBussdReq, state: SessionState): Promise<string> {
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
      if (req.Message === "1") {
        return this.utilityHandler.showGhanaWaterPaymentSummary(req.SessionId, state);
      } else if (req.Message === "2") {
        return this.releaseSession(req.SessionId);
      } else {
        return this.responseBuilder.createErrorResponse(
          req.SessionId,
          "Please select 1 to continue or 2 to cancel"
        );
      }
    } else {
      // For ECG, handle amount input
      return await this.handleUtilityAmountInput(req, state);
    }
  }

  /**
   * Handle utility step 7 (confirmation for ECG)
   */
  private async handleUtilityStep7(req: HBussdReq, state: SessionState): Promise<string> {
    // For both ECG and Ghana Water, handle confirmation after order summary is shown
    return await this.handleUtilityConfirmation(req, state);
  }

  /**
   * Handle utility step 8 (ECG prepaid amount input or end session)
   */
  private async handleUtilityStep8(req: HBussdReq, state: SessionState): Promise<string> {
    if (state.utilityProvider === UtilityProvider.GHANA_WATER) {
      // Ghana Water payment confirmation
      return await this.handleUtilityConfirmation(req, state);
    } else {
      // For ECG with prepaid topup, handle amount input after meter selection
      if (state.utilityProvider === UtilityProvider.ECG && state.utilitySubOption === 'topup' && state.selectedMeter && !state.amount) {
        return await this.handleUtilityAmountInput(req, state);
      } else {
        return this.releaseSession(req.SessionId);
      }
    }
  }

  /**
   * Handle utility step 9 (ECG payment confirmation)
   */
  private async handleUtilityStep9(req: HBussdReq, state: SessionState): Promise<string> {
    if (state.utilityProvider === UtilityProvider.GHANA_WATER) {
      // Ghana Water flow now ends at step 6 with direct payment
      return this.releaseSession(req.SessionId);
    } else {
      // For ECG with prepaid topup, handle payment confirmation after amount input
      if (state.utilityProvider === UtilityProvider.ECG && state.utilitySubOption === 'topup' && state.amount) {
        return await this.handlePaymentConfirmation(req, state);
      } else {
        return this.releaseSession(req.SessionId);
      }
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
        formattedDetails: 'Transaction status checked'
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

  /**
   * Log commission transaction after payment
   */
  private async logCommissionTransaction(req: HbPayments, isSuccessful: boolean): Promise<void> {
    try {
      const sessionState = this.sessionManager.getSession(req.SessionId);
      if (!sessionState) return;

      const commissionLogData: CommissionTransactionLogData = {
        clientReference: req.OrderId,
        hubtelTransactionId: req.OrderId,
        externalTransactionId: null, // ExternalTransactionId not available in Payment interface
        mobileNumber: req.OrderInfo?.CustomerMobileNumber || sessionState.mobile || '',
        sessionId: req.SessionId,
        serviceType: sessionState.serviceType || 'unknown',
        network: sessionState.network,
        tvProvider: sessionState.tvProvider,
        utilityProvider: sessionState.utilityProvider,
        bundleValue: sessionState.bundleValue,
        selectedBundle: sessionState.selectedBundle,
        accountNumber: sessionState.accountNumber,
        meterNumber: sessionState.meterNumber,
        amount: req.OrderInfo?.Payment?.AmountPaid || 0,
        charges: (req.OrderInfo?.Payment?.AmountPaid || 0) - (req.OrderInfo?.Payment?.AmountAfterCharges || 0),
        amountAfterCharges: req.OrderInfo?.Payment?.AmountAfterCharges || 0,
        currencyCode: req.OrderInfo?.Currency || 'GHS',
        paymentMethod: req.OrderInfo?.Payment?.PaymentType || 'mobile_money',
        status: isSuccessful ? 'Paid' : 'Unpaid',
        isFulfilled: false,
        responseCode: isSuccessful ? '0000' : '2000',
        message: isSuccessful ? 'Payment successful' : 'Payment failed',
        commissionServiceStatus: 'pending',
        transactionDate: new Date(),
        retryCount: 0,
        isRetryable: true
      };

      // Commission transaction logging removed - earnings are now calculated directly from transactions
    } catch (error) {
      console.error('Error logging commission transaction:', error);
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
}
