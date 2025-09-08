import { Injectable } from '@nestjs/common';
import { HBussdReq } from '../../../models/dto/hubtel/hb-ussd.dto';
import { NetworkProvider } from '../../../models/dto/airtime.dto';
import { SessionState } from '../types';
import { ResponseBuilder } from '../response-builder';
import { AirtimeService } from '../../airtime.service';
import { SessionManager } from '../session-manager';
import { UssdLoggingService } from '../logging.service';

@Injectable()
export class AirtimeHandler {
  constructor(
    private readonly responseBuilder: ResponseBuilder,
    private readonly airtimeService: AirtimeService,
    private readonly sessionManager: SessionManager,
    private readonly loggingService: UssdLoggingService,
  ) {}

  /**
   * Handle network selection for airtime service
   */
  async handleNetworkSelection(req: HBussdReq, state: SessionState): Promise<string> {
    if (!["1", "2", "3"].includes(req.Message)) {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Please select 1, 2, or 3"
      );
    }

    const networkMap = {
      "1": NetworkProvider.MTN,
      "2": NetworkProvider.TELECEL,
      "3": NetworkProvider.AT
    };

    state.network = networkMap[req.Message];
    this.sessionManager.updateSession(req.SessionId, state);

    // Log current session state
    await this.loggingService.logSessionState(req.SessionId, req.Mobile, state, 'active');

    return this.responseBuilder.createPhoneInputResponse(
      req.SessionId,
      "Enter Mobile Number",
      "Enter recipients mobile number"
    );
  }

  /**
   * Handle mobile number input for airtime
   */
  async handleAirtimeMobileNumber(req: HBussdReq, state: SessionState): Promise<string> {
    const validation = this.validateMobileNumber(req.Message);
    
    if (!validation.isValid) {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        validation.error || "Invalid mobile number format"
      );
    }

    state.mobile = validation.convertedNumber;
    this.sessionManager.updateSession(req.SessionId, state);

    // Log current session state
    await this.loggingService.logSessionState(req.SessionId, req.Mobile, state, 'active');

    return this.responseBuilder.createDecimalInputResponse(
      req.SessionId,
      "Enter Amount",
      "Enter amount to pay:"
    );
  }

  /**
   * Handle amount input for airtime
   */
  async handleAmountInput(req: HBussdReq, state: SessionState): Promise<string> {
    const amount = parseFloat(req.Message);
    
    if (isNaN(amount) || amount <= 0) {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Please enter a valid amount greater than 0"
      );
    }

    if (amount < 0.50) {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Minimum airtime amount is 0.50"
      );
    }

    state.amount = amount;
    state.totalAmount = amount; // Set total amount for payment
    this.sessionManager.updateSession(req.SessionId, state);

    // Log current session state
    await this.loggingService.logSessionState(req.SessionId, req.Mobile, state, 'active');

    // Show order summary and trigger payment confirmation
    return this.responseBuilder.createDisplayResponse(
      req.SessionId,
      "Airtime Top-Up",
      this.formatAirtimeOrderSummary(state) + "\n\n"
    );
  }

  /**
   * Format airtime order summary
   */
  private formatAirtimeOrderSummary(state: SessionState): string {
    const mobile = state.mobile;
    const network = state.network;
    const amount = state.amount;

    return `Airtime Top-Up Summary:\n\n` +
           `Network: ${network}\n` +
           `Mobile: ${mobile}\n` +
           `Amount: GH${amount?.toFixed(2)}\n\n` +
           `1. Confirm\n2. Cancel`;
  }

  /**
   * Validate mobile number format
   */
  private validateMobileNumber(mobile: string): { isValid: boolean; convertedNumber?: string; error?: string } {
    // Remove any non-digit characters
    const cleaned = mobile.replace(/\D/g, '');
    
    // Check if it's a valid Ghanaian mobile number
    if (cleaned.length === 10 && cleaned.startsWith('0')) {
      // Convert to international format
      const converted = '233' + cleaned.substring(1);
      return { isValid: true, convertedNumber: converted };
    }
    
    if (cleaned.length === 12 && cleaned.startsWith('233')) {
      return { isValid: true, convertedNumber: cleaned };
    }
    
    return { 
      isValid: false, 
      error: 'Must be a valid mobile number (e.g., 0550982034)' 
    };
  }
}
