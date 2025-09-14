import { Injectable } from '@nestjs/common';
import { HBussdReq } from '../../../models/dto/hubtel/hb-ussd.dto';
import { TVProvider, TVAccountQueryResponse } from '../../../models/dto/tv-bills.dto';
import { SessionState } from '../types';
import { ResponseBuilder } from '../response-builder';
import { TVBillsService } from '../../tv-bills.service';
import { SessionManager } from '../session-manager';
import { UssdLoggingService } from '../logging.service';
import { PaymentProcessor } from '../payment-processor';

@Injectable()
export class TVBillsHandler {
  constructor(
    private readonly responseBuilder: ResponseBuilder,
    private readonly tvBillsService: TVBillsService,
    private readonly sessionManager: SessionManager,
    private readonly loggingService: UssdLoggingService,
    private readonly paymentProcessor: PaymentProcessor,
  ) {}

  /**
   * Handle TV provider selection (merged from menu-handler)
   */
  async handleTVProviderSelection(req: HBussdReq, state: SessionState): Promise<string> {
    if (!["1", "2", "3"].includes(req.Message)) {
      return this.responseBuilder.createInvalidSelectionResponse(
        req.SessionId,
        "Please select 1, 2, or 3"
      );
    }

    const tvProviderMap = {
      "1": TVProvider.DSTV,
      "2": TVProvider.GOTV,
      "3": TVProvider.STARTIMES
    };

    state.tvProvider = tvProviderMap[req.Message];
    this.sessionManager.updateSession(req.SessionId, state);

    // Log current session state
    await this.loggingService.logSessionState(req.SessionId, req.Mobile, state, 'active');

    return this.responseBuilder.createResponse(
      req.SessionId,
      "Enter Account Number",
      "Enter a valid smart card/IUC number:",
      "INPUT",
      "TEXT"
    );
  }

  /**
   * Handle TV account query
   */
  async handleTVAccountQuery(req: HBussdReq, state: SessionState): Promise<string> {
    try {
      // Validate account number format
      if (!this.validateAccountNumber(req.Message, state.tvProvider)) {
        return this.responseBuilder.createErrorResponse(
          req.SessionId,
          "Enter a valid smart card/IUC number"
        );
      }

      // Query account from Hubtel
      const accountInfo = await this.tvBillsService.queryAccount({
        accountNumber: req.Message,
        provider: state.tvProvider
      });

      // Store account info in session
      state.accountNumber = req.Message;
      state.accountInfo = [accountInfo];
      this.sessionManager.updateSession(req.SessionId, state);

    // Log current session state
    await this.loggingService.logSessionState(req.SessionId, req.Mobile, state, 'active');

    const accountDisplay = this.formatTVAccountInfo(accountInfo, state);
    return this.responseBuilder.createResponse(
      req.SessionId,
      "Account Found",
      accountDisplay + "\n\n1. Renew subscription\n2. Change subscription",
      "input",
      "text"
    );
    } catch (error) {
      console.error("Error querying TV account:", error);
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Unable to verify account. Please try again."
      );
    }
  }

  /**
   * Handle subscription option selection
   */
  async handleSubscriptionOptionSelection(req: HBussdReq, state: SessionState): Promise<string> {
    if (!["1", "2"].includes(req.Message)) {
      return this.responseBuilder.createInvalidSelectionResponse(
        req.SessionId,
        "Please select 1 or 2"
      );
    }

    if (req.Message === "1") {
      return await this.handleRenewSubscription(req, state);
    } else if (req.Message === "2") {
      return await this.handleChangeSubscription(req, state);
    }
  }

  /**
   * Handle renew subscription flow
   */
  async handleRenewSubscription(req: HBussdReq, state: SessionState): Promise<string> {
    try {
      const accountInfo = state.accountInfo?.[0];
      if (!accountInfo) {
        return this.responseBuilder.createErrorResponse(
          req.SessionId,
          "Account information not found. Please try again."
        );
      }

      // Extract amount due from account info
      const amountDueData = accountInfo.Data?.find(item => item.Display === 'amountDue');
      if (!amountDueData || !amountDueData.Value) {
        return this.responseBuilder.createErrorResponse(
          req.SessionId,
          "Unable to retrieve subscription amount. Please try again."
        );
      }

      const subscriptionAmount = parseFloat(amountDueData.Value);
      if (isNaN(subscriptionAmount) || subscriptionAmount <= 0) {
        return this.responseBuilder.createErrorResponse(
          req.SessionId,
          "Invalid subscription amount. Please try again."
        );
      }

      // Set the amount to the full subscription amount
      state.amount = subscriptionAmount;
      state.totalAmount = subscriptionAmount;
      state.subscriptionType = 'renew';
      this.sessionManager.updateSession(req.SessionId, state);

      // Log current session state
      await this.loggingService.logSessionState(req.SessionId, req.Mobile, state, 'active');

      // Show renewal summary for confirmation
      return this.responseBuilder.createResponse(
        req.SessionId,
        "Renewal Summary",
        this.formatTVOrderSummary(state, 'renewal'),
        "input",
        "text"
      );
    } catch (error) {
      console.error("Error processing renewal:", error);
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Unable to process renewal. Please try again."
      );
    }
  }

  /**
   * Handle change subscription flow (placeholder)
   */
  async handleChangeSubscription(req: HBussdReq, state: SessionState): Promise<string> {
    // This is a placeholder for future development
    return this.responseBuilder.createResponse(
      req.SessionId,
      "Change Subscription",
      "This feature is will be available soon.\n\nThank you for your patience.",
      "end",
      "text"
    );
  }

  /**
   * Handle payment confirmation for TV bills
   */
  async handlePaymentConfirmation(req: HBussdReq, state: SessionState): Promise<string> {
    if (req.Message !== "1") {
      return this.responseBuilder.createThankYouResponse(req.SessionId);
    }

    const total = state.totalAmount;
    state.totalAmount = total;
    this.sessionManager.updateSession(req.SessionId, state);

    // Log current session state
    await this.loggingService.logSessionState(req.SessionId, req.Mobile, state, 'active');

    const serviceName = this.paymentProcessor.getServiceName(state);
    return this.paymentProcessor.createPaymentRequest(req.SessionId, total, serviceName);
  }

  /**
   * Handle TV amount input
   */
  async handleTVAmountInput(req: HBussdReq, state: SessionState): Promise<string> {
    const amount = parseFloat(req.Message);
    
    if (isNaN(amount) || amount <= 0) {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Please enter a valid amount greater than 0"
      );
    }

    if (amount < 1) {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Minimum payment amount is GH₵1.00"
      );
    }

    state.amount = amount;
    state.totalAmount = amount;
    this.sessionManager.updateSession(req.SessionId, state);

    // Log current session state
    await this.loggingService.logSessionState(req.SessionId, req.Mobile, state, 'active');

    // Show order summary after amount input
    return this.responseBuilder.createResponse(
      req.SessionId,
      "Order Summary",
      this.formatTVOrderSummary(state),
      "input",
      "text"
    );
  }

  /**
   * Format TV account information
   */
  private formatTVAccountInfo(accountInfo: any, state: SessionState): string {
    const nameData = accountInfo.Data?.find(item => item.Display === 'name');
    const amountDueData = accountInfo.Data?.find(item => item.Display === 'amountDue');
    const accountData = accountInfo.Data?.find(item => item.Display === 'account');
    
    let info = "Account Details:\n";
    info += `Provider: ${state.tvProvider}\n`;
    info += `Customer: ${nameData?.Value || 'N/A'}\n`;
    info += `Account: ${accountData?.Value || 'N/A'}\n`;
    
    if (amountDueData) {
      const amount = parseFloat(amountDueData.Value);
      if (amount > 0) {
        info += `Amount Due: GHS${amount.toFixed(2)}\n`;
      }
    }
    return info;
  }

  /**
   * Format TV order summary (unified method for both renewal and payment)
   */
  private formatTVOrderSummary(state: SessionState, type: 'renewal' | 'payment' = 'payment'): string {
    const provider = state.tvProvider;
    const accountNumber = state.accountNumber;
    const amount = state.amount;
    const accountInfo = state.accountInfo?.[0];
    const nameData = accountInfo?.Data?.find(item => item.Display === 'name');

    const title = type === 'renewal' ? 'Subscription Renewal' : 'Bill Payment';
    const amountLabel = type === 'renewal' ? 'Renewal Amount' : 'Amount';
    const confirmText = type === 'renewal' ? 'Confirm Renewal' : 'Confirm';

    return `${title}:\n` +
           `Provider: ${provider}\n` +
           `Account: ${accountNumber}\n` +
           `Customer: ${nameData?.Value || 'N/A'}\n` +
           `${amountLabel}: GHS${amount?.toFixed(2)}\n\n` +
           `1. ${confirmText}\n2. Cancel`;
  }

  /**
   * Validate account number format
   */
  private validateAccountNumber(accountNumber: string, provider?: TVProvider): boolean {
    if (!accountNumber || accountNumber.trim().length === 0) {
      return false;
    }

    const cleaned = accountNumber.replace(/\s/g, '');
    
    switch (provider) {
      case TVProvider.DSTV:
        return /^\d{10,12}$/.test(cleaned);
      case TVProvider.GOTV:
        return /^\d{10,12}$/.test(cleaned);
      case TVProvider.STARTIMES:
        return /^\d{10,12}$/.test(cleaned);
      default:
        return /^\d{8,15}$/.test(cleaned);
    }
  }
}
