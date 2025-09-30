import { Injectable } from '@nestjs/common';
import { HBussdReq } from '../../../models/dto/hubtel/hb-ussd.dto';
import { NetworkProvider } from '../../../models/dto/airtime.dto';
import { SessionState } from '../types';
import { ResponseBuilder } from '../response-builder';
import { SessionManager } from '../session-manager';
import { UssdLoggingService } from '../logging.service';

@Injectable()
export class AirtimeHandler {
  // Network mapping constants
  private readonly NETWORK_MAP = {
    "1": NetworkProvider.MTN,
    "2": NetworkProvider.TELECEL,
    "3": NetworkProvider.AT
  };

  // Flow mapping constants
  private readonly FLOW_MAP = {
    "1": "self",
    "2": "other"
  };

  // Minimum airtime amount
  private readonly MIN_AMOUNT = 0.50;

  constructor(
    private readonly responseBuilder: ResponseBuilder,
    private readonly sessionManager: SessionManager,
    private readonly loggingService: UssdLoggingService,
  ) {}

  /**
   * Update session and log state
   */
  private async updateAndLog(req: HBussdReq, state: SessionState): Promise<void> {
    this.sessionManager.updateSession(req.SessionId, state);
    await this.loggingService.logSessionState(req.SessionId, req.Mobile, state, 'active');
  }

  /**
   * Validate selection input
   */
  private validateSelection(message: string, validOptions: string[]): boolean {
    return validOptions.includes(message);
  }

  /**
   * Handle network selection for airtime service
   */
  async handleNetworkSelection(req: HBussdReq, state: SessionState): Promise<string> {
    if (!this.validateSelection(req.Message, ["1", "2", "3"])) {
      return this.responseBuilder.createErrorResponse(req.SessionId, "Please select 1, 2, or 3");
    }

    state.network = this.NETWORK_MAP[req.Message];
    await this.updateAndLog(req, state);

    return this.responseBuilder.createNumberInputResponse(
      req.SessionId,
      "Who are you buying for?",
      "Buy for:\n1. Self\n2. Other"
    );
  }

  /**
   * Handle self/other selection for airtime
   */
  async handleBuyerTypeSelection(req: HBussdReq, state: SessionState): Promise<string> {
    if (!this.validateSelection(req.Message, ["1", "2"])) {
      return this.responseBuilder.createErrorResponse(req.SessionId, "Please select 1 or 2");
    }

    state.flow = this.FLOW_MAP[req.Message];
    await this.updateAndLog(req, state);

    if (state.flow === "self") {
      state.mobile = req.Mobile;
      await this.updateAndLog(req, state);
      return this.responseBuilder.createDecimalInputResponse(
        req.SessionId,
        "Enter Amount",
        "Enter amount"
      );
    }

    return this.responseBuilder.createPhoneInputResponse(
      req.SessionId,
      "Enter Mobile Number",
      "Enter recipient mobile number:"
    );
  }

  /**
   * Handle mobile number input for airtime (when buying for other)
   */
  async handleAirtimeMobileNumber(req: HBussdReq, state: SessionState): Promise<string> {
    const validation = this.validateMobileNumber(req.Message);
    
    if (!validation.isValid) {
      return this.responseBuilder.createErrorResponse(req.SessionId, validation.error || "Invalid mobile number format");
    }

    state.mobile = validation.convertedNumber;
    await this.updateAndLog(req, state);

    return this.responseBuilder.createDecimalInputResponse(
      req.SessionId,
      "Enter Amount",
      "Enter amount"
    );
  }

  /**
   * Handle amount input for airtime
   */
  async handleAmountInput(req: HBussdReq, state: SessionState): Promise<string> {
    const amount = parseFloat(req.Message);
    
    if (isNaN(amount) || amount <= 0) {
      return this.responseBuilder.createErrorResponse(req.SessionId, "Please enter a valid amount greater than 0");
    }

    if (amount < this.MIN_AMOUNT) {
      return this.responseBuilder.createErrorResponse(req.SessionId, `Minimum airtime amount is ${this.MIN_AMOUNT}`);
    }

    state.amount = amount;
    state.totalAmount = amount;
    await this.updateAndLog(req, state);

    return this.responseBuilder.createDisplayResponse(
      req.SessionId,
      "Airtime Top-Up",
      this.formatAirtimeOrderSummary(state) + "\n"
    );
  }

  /**
   * Format airtime order summary
   */
  private formatAirtimeOrderSummary(state: SessionState): string {
    const { mobile, network, amount, flow } = state;
    const recipient = flow === 'self' ? 'Self' : 'Other';

    return `Airtime top-Up 100% bonus on exclusive networks:\n` +
           `Network: ${network}\n` +
           `Recipient: ${recipient}\n` +
           `Mobile: ${mobile}\n` +
           `Amount: GH${amount?.toFixed(2)}\n\n` +
           `1. Confirm\n2. Cancel`;
  }

  /**
   * Validate mobile number format
   */
  private validateMobileNumber(mobile: string): { isValid: boolean; convertedNumber?: string; error?: string } {
    const cleaned = mobile.replace(/\D/g, '');
    
    // Ghanaian mobile number validation
    if (cleaned.length === 10 && cleaned.startsWith('0')) {
      return { isValid: true, convertedNumber: '233' + cleaned.substring(1) };
    }
    
    if (cleaned.length === 12 && cleaned.startsWith('233')) {
      return { isValid: true, convertedNumber: cleaned };
    }
    
    return { 
      isValid: false, 
      error: 'Must be a valid mobile number (e.g. 0550982043)' 
    };
  }
}