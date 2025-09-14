import { Injectable } from '@nestjs/common';
import { HBussdReq } from '../../../models/dto/hubtel/hb-ussd.dto';
import { UtilityProvider, UtilityQueryResponse } from '../../../models/dto/utility.dto';
import { SessionState } from '../types';
import { ResponseBuilder } from '../response-builder';
import { UtilityService } from '../../utility.service';
import { SessionManager } from '../session-manager';
import { UssdLoggingService } from '../logging.service';

@Injectable()
export class UtilityHandler {
  constructor(
    private readonly responseBuilder: ResponseBuilder,
    private readonly utilityService: UtilityService,
    private readonly sessionManager: SessionManager,
    private readonly loggingService: UssdLoggingService,
  ) {}

  /**
   * Handle ECG meter type selection (Prepaid/Postpaid)
   */
  async handleECGMeterTypeSelection(req: HBussdReq, state: SessionState): Promise<string> {
    if (!["1", "2"].includes(req.Message)) {
      return this.createError(req.SessionId, "Please select 1 or 2");
    }

    const meterTypeMap = { "1": "prepaid" as const, "2": "postpaid" as const };
    state.meterType = meterTypeMap[req.Message];
    this.updateAndLog(req, state);

    const optionText = state.meterType === "prepaid" 
      ? "Select Prepaid Option:\n1. Top-up prepaid\n2. Add Prepaid meter"
      : "Select Postpaid Option:\n1. Pay Bill\n2. Add postpaid meter";
    
    return this.responseBuilder.createNumberInputResponse(
      req.SessionId,
      `${state.meterType.charAt(0).toUpperCase() + state.meterType.slice(1)} Options`,
      optionText
    );
  }

  /**
   * Handle ECG sub-option selection (Top-up/Add meter/Pay Bill)
   */
  async handleECGSubOptionSelection(req: HBussdReq, state: SessionState): Promise<string> {
    if (!["1", "2"].includes(req.Message)) {
      return this.createError(req.SessionId, "Please select 1 or 2");
    }

    const optionMaps = {
      prepaid: { "1": "topup" as const, "2": "add_meter" as const },
      postpaid: { "1": "pay_bill" as const, "2": "add_meter" as const }
    };

    state.utilitySubOption = optionMaps[state.meterType][req.Message];
    this.updateAndLog(req, state);

    // Show coming soon for non-topup options
    if (state.meterType === "postpaid" || state.utilitySubOption === "add_meter") {
      return this.createComingSoon(req.SessionId);
    }

    // Proceed with prepaid topup
    return this.responseBuilder.createPhoneInputResponse(
      req.SessionId,
      "Enter Mobile Number",
      "Enter mobile number linked to ECG meter:"
    );
  }

  /**
   * Handle utility provider selection
   */
  async handleUtilityProviderSelection(req: HBussdReq, state: SessionState): Promise<string> {
    if (!["1", "2"].includes(req.Message)) {
      return this.createError(req.SessionId, "Please select 1 or 2");
    }

    const providerMap = { "1": UtilityProvider.ECG, "2": UtilityProvider.GHANA_WATER };
    state.utilityProvider = providerMap[req.Message];
    this.updateAndLog(req, state);

    return state.utilityProvider === UtilityProvider.ECG
      ? this.responseBuilder.createNumberInputResponse(
          req.SessionId,
          "Select Meter Type",
          "Select Meter Type:\n1. Prepaid\n2. Postpaid"
        )
      : this.responseBuilder.createPhoneInputResponse(
          req.SessionId,
          "Enter Mobile Number",
          "Enter mobile number linked to Ghana Water meter:"
        );
  }

  /**
   * Handle utility query (ECG mobile number or Ghana Water mobile number)
   */
  async handleUtilityQuery(req: HBussdReq, state: SessionState): Promise<string> {
    try {
      return state.utilityProvider === UtilityProvider.ECG
        ? await this.handleECGQuery(req, state)
        : await this.handleGhanaWaterMobileInput(req, state);
    } catch (error) {
      console.error("Error querying utility:", error);
      return this.createError(req.SessionId, "Unable to verify account. Please try again.");
    }
  }

  /**
   * Handle ECG query
   */
  private async handleECGQuery(req: HBussdReq, state: SessionState): Promise<string> {
    const validation = this.validateMobileNumber(req.Message);
    if (!validation.isValid) {
      return this.createError(req.SessionId, validation.error || "Invalid mobile number format");
    }

    const meterResponse = await this.utilityService.queryECGMeters({
      mobileNumber: validation.convertedNumber
    });

    if (meterResponse.ResponseCode !== '0000') {
      return this.createError(req.SessionId, `No meters found: ${meterResponse.Message}`);
    }

    state.mobile = validation.convertedNumber;
    state.meterInfo = meterResponse.Data;
    this.updateAndLog(req, state);

    return this.responseBuilder.createNumberInputResponse(
      req.SessionId,
      "Select Meter",
      this.formatECGMeterMenu(state)
    );
  }

  /**
   * Handle Ghana Water mobile number input
   */
  private async handleGhanaWaterMobileInput(req: HBussdReq, state: SessionState): Promise<string> {
    const validation = this.validateMobileNumber(req.Message);
    if (!validation.isValid) {
      return this.createError(req.SessionId, validation.error || "Invalid mobile number format");
    }

    state.mobile = validation.convertedNumber;
    this.updateAndLog(req, state);

    return this.responseBuilder.createNumberInputResponse(
      req.SessionId,
      "Enter Meter Number",
      "Enter meter number:(eg.0106XXXXX010)-12 digits"
    );
  }

  /**
   * Handle Ghana Water query
   */
  private async handleGhanaWaterQuery(req: HBussdReq, state: SessionState): Promise<string> {
    if (!this.validateMeterNumber(req.Message)) {
      return this.createError(req.SessionId, "Please enter a valid meter number");
    }
    if (!state.mobile) {
      return this.createError(req.SessionId, "Mobile number not found. Please restart the session.");
    }

    const accountResponse = await this.utilityService.queryGhanaWaterAccount({
      meterNumber: req.Message,
      mobileNumber: state.mobile
    });

    if (accountResponse.ResponseCode !== '0000') {
      return this.createError(req.SessionId, "Account not found");
    }

    // Extract and validate amount
    const amountDueData = accountResponse.Data?.find(item => item.Display === 'amountDue');
    if (!amountDueData?.Value) {
      return this.createError(req.SessionId, "Unable to retrieve bill amount. Please try again.");
    }

    const billAmount = Math.abs(parseFloat(amountDueData.Value));
    if (isNaN(billAmount) || billAmount === 0) {
      return this.createError(req.SessionId, "Invalid bill amount. Please try again.");
    }

    // Update state
    Object.assign(state, {
      meterNumber: req.Message,
      meterInfo: accountResponse.Data,
      amount: billAmount,
      totalAmount: billAmount,
      email: "guglextechnologies@gmail.com",
      sessionId: accountResponse.Data?.find(item => item.Display === 'sessionId')?.Value
    });

    this.updateAndLog(req, state);

    const accountInfo = this.formatGhanaWaterAccountInfo(accountResponse.Data);
    return this.responseBuilder.createResponse(
      req.SessionId,
      "Bill Summary",
      accountInfo + "\n\n1. Continue\n2. Cancel",
      "input",
      "text"
    );
  }

  /**
   * Handle utility step 5 (meter selection for ECG or meter number for Ghana Water)
   */
  async handleUtilityStep5(req: HBussdReq, state: SessionState): Promise<string> {
    return state.utilityProvider === UtilityProvider.ECG
      ? await this.handleECGMeterSelection(req, state)
      : await this.handleGhanaWaterQuery(req, state);
  }

  /**
   * Handle ECG meter selection
   */
  private async handleECGMeterSelection(req: HBussdReq, state: SessionState): Promise<string> {
    const meters = state.meterInfo || [];
    const selectedIndex = parseInt(req.Message) - 1;

    if (selectedIndex < 0 || selectedIndex >= meters.length) {
      return this.createError(req.SessionId, "Please select a valid meter option");
    }

    state.selectedMeter = meters[selectedIndex];
    state.meterNumber = meters[selectedIndex].Value;
    this.updateAndLog(req, state);

    return this.responseBuilder.createDecimalInputResponse(
      req.SessionId,
      "Enter Amount",
      "Enter top-up amount:"
    );
  }

  /**
   * Handle utility amount input
   */
  async handleUtilityAmountInput(req: HBussdReq, state: SessionState): Promise<string> {
    const amount = parseFloat(req.Message);
    
    if (isNaN(amount) || amount <= 0) {
      return this.createError(req.SessionId, "Please enter a valid amount greater than 0");
    }
    if (amount < 1) {
      return this.createError(req.SessionId, "Minimum top-up amount is GH₵1.00");
    }

    state.amount = amount;
    state.totalAmount = amount;
    this.updateAndLog(req, state);

    return this.responseBuilder.createDisplayResponse(
      req.SessionId,
      "Utility Top-Up",
      this.formatUtilityOrderSummary(state) + "\n\n"
    );
  }

  /**
   * Show Ghana Water payment summary
   */
  showGhanaWaterPaymentSummary(sessionId: string, state: SessionState): string {
    return this.responseBuilder.createResponse(
      sessionId,
      "Payment Summary",
      this.formatUtilityOrderSummary(state),
      "input",
      "text"
    );
  }

  /**
   * Format Ghana Water bill information
   */
  private formatGhanaWaterAccountInfo(data: any[]): string {
    const nameData = data.find(item => item.Display === 'name');
    const amountDueData = data.find(item => item.Display === 'amountDue');
    
    let info = "Bill Details:\n";
    info += `Customer: ${nameData?.Value || 'N/A'}\n`;
    
    if (amountDueData) {
      const amount = Math.abs(parseFloat(amountDueData.Value));
      if (amount > 0) {
        info += `Amount Due: GHS${amount.toFixed(2)}\n`;
      } else {
        info += `Balance: GHS0.00\n`;
      }
    }
    
    return info;
  }

  /**
   * Format ECG meter menu
   */
  private formatECGMeterMenu(state: SessionState): string {
    const meters = state.meterInfo || [];
    let menu = "Select Meter:\n";
    
    meters.forEach((meter, index) => {
      menu += `${index + 1}. ${meter.Display}\n`;
    });

    return menu;
  }

  /**
   * Format utility order summary
   */
  private formatUtilityOrderSummary(state: SessionState): string {
    const provider = state.utilityProvider;
    const amount = state.amount;

    if (provider === UtilityProvider.ECG) {
      const meter = state.selectedMeter;
      const meterTypeDisplay = state.meterType === 'prepaid' ? 'Prepaid' : 'Postpaid';
      return `ECG ${meterTypeDisplay} Top-up:\n\n` +
             `Provider: ${provider}\n` +
             `Meter Type: ${meterTypeDisplay}\n` +
             `Meter: ${meter?.Display}\n` +
             `Amount: GHS${amount?.toFixed(2)}\n\n` +
             `1. Confirm\n2. Cancel`;
    } else {
      return `Ghana Water:\n\n` +
             `Provider: ${provider}\n` +
             `Meter: ${state.meterNumber}\n` +
             `Amount: GHS${amount?.toFixed(2)}\n\n` +
             `1. Confirm\n2. Cancel`;
    }
  }

  // Helper methods
  private createError(sessionId: string, message: string): string {
    return this.responseBuilder.createErrorResponse(sessionId, message);
  }

  private createComingSoon(sessionId: string): string {
    return this.responseBuilder.createResponse(
      sessionId,
      "Coming Soon",
      "This service is coming soon. Thank you for your patience.\n\n0. Back to main menu",
      "display",
      "text"
    );
  }

  private updateAndLog(req: HBussdReq, state: SessionState): void {
    this.sessionManager.updateSession(req.SessionId, state);
    this.loggingService.logSessionState(req.SessionId, req.Mobile, state, 'active');
  }

  private validateMobileNumber(mobile: string): { isValid: boolean; convertedNumber?: string; error?: string } {
    const cleaned = mobile.replace(/\D/g, '');
    
    if (cleaned.length === 10 && cleaned.startsWith('0')) {
      return { isValid: true, convertedNumber: '233' + cleaned.substring(1) };
    }
    if (cleaned.length === 12 && cleaned.startsWith('233')) {
      return { isValid: true, convertedNumber: cleaned };
    }
    
    return { isValid: false, error: 'Must be a valid mobile number (e.g., 0550982043)' };
  }

  private validateMeterNumber(meterNumber: string): boolean {
    return meterNumber?.trim() && /^\d{8,15}$/.test(meterNumber.replace(/\s/g, ''));
  }
}
