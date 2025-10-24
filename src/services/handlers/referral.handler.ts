import { Injectable } from "@nestjs/common";
import { HBussdReq } from "../../models/dto/hubtel/hb-ussd.dto";
import { SessionState } from "../ussd/types";
import { ResponseBuilder } from "../ussd/response-builder";
import { SessionManager } from "../ussd/session-manager";
import { ReferralService } from "../referral.service";

@Injectable()
export class ReferralHandler {
  constructor(
    private readonly responseBuilder: ResponseBuilder,
    private readonly sessionManager: SessionManager,
    private readonly referralService: ReferralService
  ) {}

  /**
   * Show referral code prompt after successful payment
   */
  async showReferralPrompt(req: HBussdReq, state: SessionState): Promise<string> {
    const message = `Payment Successful! 🎉\n\nWould you like to enter a referral code?\n\n1. Enter referral code\n2. Skip`;
    
    // Update session state to track referral flow
    state.referralFlow = 'prompt';
    this.sessionManager.updateSession(req.SessionId, state);
    
    return this.responseBuilder.createNumberInputResponse(
      req.SessionId,
      "Referral Code",
      message
    );
  }

  /**
   * Handle referral code prompt selection
   */
  async handleReferralPrompt(req: HBussdReq, state: SessionState): Promise<string> {
    if (req.Message === "1") {
      // User wants to enter referral code
      state.referralFlow = 'input';
      this.sessionManager.updateSession(req.SessionId, state);
      
      const message = `Enter Referral Code\n\nPlease enter the 2-digit referral code:\n\nExample: 01, 02, etc.`;
      
      return this.responseBuilder.createTextInputResponse(
        req.SessionId,
        "Enter Referral Code",
        message
      );
    } else if (req.Message === "2") {
      // User wants to skip
      return this.handleReferralSkip(req, state);
    } else {
      return this.responseBuilder.createInvalidSelectionResponse(
        req.SessionId,
        "Please select 1 to enter code or 2 to skip"
      );
    }
  }

  /**
   * Handle referral code input
   */
  async handleReferralCodeInput(req: HBussdReq, state: SessionState): Promise<string> {
    const referralCode = req.Message.trim();
    
    // Validate referral code format (2 digits)
    if (!/^\d{2}$/.test(referralCode)) {
      const message = `Invalid Format\n\nPlease enter a valid 2-digit referral code:\n\nExample: 01, 02, etc.\n\n1. Try again\n2. Skip`;
      
      state.referralFlow = 'retry';
      this.sessionManager.updateSession(req.SessionId, state);
      
      return this.responseBuilder.createNumberInputResponse(
        req.SessionId,
        "Invalid Code",
        message
      );
    }

    // Process the referral code
    const result = await this.referralService.processReferralCode(referralCode, req.Mobile);
    
    if (result.success) {
      const message = `Referral Code Applied! ✅\n\nThank you for using referral code ${referralCode}\nReferrer: ${result.referrerName}\n\nYou will earn 5% bonus on future transactions!`;
      
      return this.responseBuilder.createReleaseResponse(
        req.SessionId,
        "Referral Success",
        message
      );
    } else {
      const message = `Referral Failed\n\n${result.message}\n\n1. Try another code\n2. Skip`;
      
      state.referralFlow = 'retry';
      this.sessionManager.updateSession(req.SessionId, state);
      
      return this.responseBuilder.createNumberInputResponse(
        req.SessionId,
        "Referral Failed",
        message
      );
    }
  }

  /**
   * Handle referral retry (after invalid code)
   */
  async handleReferralRetry(req: HBussdReq, state: SessionState): Promise<string> {
    if (req.Message === "1") {
      // Try again
      state.referralFlow = 'input';
      this.sessionManager.updateSession(req.SessionId, state);
      
      const message = `Enter Referral Code\n\nPlease enter the 2-digit referral code:\n\nExample: 01, 02, etc.`;
      
      return this.responseBuilder.createTextInputResponse(
        req.SessionId,
        "Enter Referral Code",
        message
      );
    } else if (req.Message === "2") {
      // Skip
      return this.handleReferralSkip(req, state);
    } else {
      return this.responseBuilder.createInvalidSelectionResponse(
        req.SessionId,
        "Please select 1 to try again or 2 to skip"
      );
    }
  }

  /**
   * Handle referral skip
   */
  private handleReferralSkip(req: HBussdReq, state: SessionState): string {
    const message = `Thank You! 🎉\n\nYour payment was successful!\n\nYou can still use a referral code in future transactions for bonus earnings.`;
    
    return this.responseBuilder.createReleaseResponse(
      req.SessionId,
      "Payment Complete",
      message
    );
  }

  /**
   * Main referral handler - routes to appropriate method based on flow state
   */
  async handleReferralFlow(req: HBussdReq, state: SessionState): Promise<string> {
    switch (state.referralFlow) {
      case 'prompt':
        return await this.handleReferralPrompt(req, state);
      case 'input':
        return await this.handleReferralCodeInput(req, state);
      case 'retry':
        return await this.handleReferralRetry(req, state);
      default:
        return await this.showReferralPrompt(req, state);
    }
  }
}
