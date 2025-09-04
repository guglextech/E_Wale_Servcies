import { Injectable } from '@nestjs/common';
import { HBussdReq } from '../../../models/dto/hubtel/hb-ussd.dto';
import { TVProvider, TVAccountQueryResponse } from '../../../models/dto/tv-bills.dto';
import { SessionState } from '../types';
import { ResponseBuilder } from '../response-builder';
import { TVBillsService } from '../../tv-bills.service';
import { SessionManager } from '../session-manager';
import { UssdLoggingService } from '../logging.service';

@Injectable()
export class TVBillsHandler {
  constructor(
    private readonly responseBuilder: ResponseBuilder,
    private readonly tvBillsService: TVBillsService,
    private readonly sessionManager: SessionManager,
    private readonly loggingService: UssdLoggingService,
  ) {}

  /**
   * Handle TV provider selection
   */
  async handleTVProviderSelection(req: HBussdReq, state: SessionState): Promise<string> {
    if (!["1", "2", "3"].includes(req.Message)) {
      return this.responseBuilder.createErrorResponse(
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

    // Log TV provider selection
    await this.logInteraction(req, state, 'tv_provider_selected');

    return this.responseBuilder.createNumberInputResponse(
      req.SessionId,
      "Enter Account Number",
      "Enter TV account number:"
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
          "Please enter a valid account number"
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

      // Log account query
      await this.logInteraction(req, state, 'account_queried');

      // Display account information before proceeding
      const accountDisplay = this.formatTVAccountInfo(accountInfo);
      
      return this.responseBuilder.createResponse(
        req.SessionId,
        "Account Found",
        accountDisplay + "\n\nEnter subscription amount to continue...",
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
    this.sessionManager.updateSession(req.SessionId, state);

    // Log amount input
    await this.logInteraction(req, state, 'amount_entered');

    return this.responseBuilder.createDisplayResponse(
      req.SessionId,
      "Order Summary",
      this.formatTVOrderSummary(state)
    );
  }

  /**
   * Format TV account information
   */
  private formatTVAccountInfo(accountInfo: any): string {
    const nameData = accountInfo.Data?.find(item => item.Display === 'name');
    const amountDueData = accountInfo.Data?.find(item => item.Display === 'amountDue');
    const accountData = accountInfo.Data?.find(item => item.Display === 'account');
    
    let info = "Account Details:\n";
    info += `Customer: ${nameData?.Value || 'N/A'}\n`;
    info += `Account: ${accountData?.Value || 'N/A'}\n`;
    
    if (amountDueData) {
      const amount = parseFloat(amountDueData.Value);
      if (amount > 0) {
        info += `Amount Due: GHS${amount.toFixed(2)}\n`;
      } else if (amount < 0) {
        info += `Credit Balance: GHS${Math.abs(amount).toFixed(2)}\n`;
      } else {
        info += `Balance: GHS0.00\n`;
      }
    }
    
    return info;
  }

  /**
   * Format TV order summary
   */
  private formatTVOrderSummary(state: SessionState): string {
    const provider = state.tvProvider;
    const accountNumber = state.accountNumber;
    const amount = state.amount;
    const accountInfo = state.accountInfo?.[0];

    return `Bill Payment Summary:\n\n` +
           `Provider: ${provider}\n` +
           `Account: ${accountNumber}\n` +
           `Customer: ${accountInfo?.Display || 'N/A'}\n` +
           `Amount: GH${amount?.toFixed(2)}\n\n` +
           `1. Confirm\n2. Cancel`;
  }

  /**
   * Log USSD interaction with proper data structure
   */
  private async logInteraction(req: HBussdReq, state: SessionState, status: string): Promise<void> {
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
      status,
      userAgent: 'USSD',
      deviceInfo: 'Mobile USSD',
      location: 'Ghana'
    });
  }

  /**
   * Validate account number format
   */
  private validateAccountNumber(accountNumber: string, provider?: TVProvider): boolean {
    if (!accountNumber || accountNumber.trim().length === 0) {
      return false;
    }

    // Basic validation - can be enhanced based on provider-specific formats
    const cleaned = accountNumber.replace(/\s/g, '');
    
    switch (provider) {
      case TVProvider.DSTV:
        // DSTV account numbers are typically 10-12 digits
        return /^\d{10,12}$/.test(cleaned);
      case TVProvider.GOTV:
        // GoTV account numbers are typically 10-12 digits
        return /^\d{10,12}$/.test(cleaned);
      case TVProvider.STARTIMES:
        // StarTimes account numbers are typically 10-12 digits
        return /^\d{10,12}$/.test(cleaned);
      default:
        // Default validation for unknown providers
        return /^\d{8,15}$/.test(cleaned);
    }
  }
}
