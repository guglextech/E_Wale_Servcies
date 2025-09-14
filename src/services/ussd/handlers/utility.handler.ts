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
   * Handle utility provider selection
   */
  async handleUtilityProviderSelection(req: HBussdReq, state: SessionState): Promise<string> {
    if (!["1", "2"].includes(req.Message)) {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Please select 1 or 2"
      );
    }

    const utilityProviderMap = {
      "1": UtilityProvider.ECG,
      "2": UtilityProvider.GHANA_WATER
    };

    state.utilityProvider = utilityProviderMap[req.Message];
    this.sessionManager.updateSession(req.SessionId, state);

    // Log current session state
    await this.loggingService.logSessionState(req.SessionId, req.Mobile, state, 'active');

    const message = state.utilityProvider === UtilityProvider.ECG
      ? "Enter mobile number linked to ECG meter:"
      : "Enter mobile number linked to Ghana Water meter:";

    return this.responseBuilder.createPhoneInputResponse(
      req.SessionId,
      "Enter Mobile Number",
      message
    );
  }

  /**
   * Handle utility query (ECG mobile number or Ghana Water mobile number)
   */
  async handleUtilityQuery(req: HBussdReq, state: SessionState): Promise<string> {
    try {
      if (state.utilityProvider === UtilityProvider.ECG) {
        return await this.handleECGQuery(req, state);
      } else {
        return await this.handleGhanaWaterMobileInput(req, state);
      }
    } catch (error) {
      console.error("Error querying utility:", error);
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Unable to verify account. Please try again."
      );
    }
  }

  /**
   * Handle ECG query
   */
  private async handleECGQuery(req: HBussdReq, state: SessionState): Promise<string> {
    const validation = this.validateMobileNumber(req.Message);
    
    if (!validation.isValid) {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        validation.error || "Invalid mobile number format"
      );
    }

    const meterResponse: UtilityQueryResponse = await this.utilityService.queryECGMeters({
      mobileNumber: validation.convertedNumber
    });

    if (meterResponse.ResponseCode !== '0000') {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        `No meters found: ${meterResponse.Message}`
      );
    }

    state.mobile = validation.convertedNumber;
    state.meterInfo = meterResponse.Data;
    this.sessionManager.updateSession(req.SessionId, state);

    // Log current session state
    await this.loggingService.logSessionState(req.SessionId, req.Mobile, state, 'active');

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
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        validation.error || "Invalid mobile number format"
      );
    }

    state.mobile = validation.convertedNumber;
    this.sessionManager.updateSession(req.SessionId, state);

    // Log current session state
    await this.loggingService.logSessionState(req.SessionId, req.Mobile, state, 'active');

    return this.responseBuilder.createNumberInputResponse(
      req.SessionId,
      "Enter Meter Number",
      "Enter meter number:"
    );
  }

  /**
   * Handle Ghana Water query
   */
  private async handleGhanaWaterQuery(req: HBussdReq, state: SessionState): Promise<string> {
    if (!this.validateMeterNumber(req.Message)) {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Please enter a valid meter number"
      );
    }

    if (!state.mobile) {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Mobile number not found. Please restart the session."
      );
    }

    const accountResponse: UtilityQueryResponse = await this.utilityService.queryGhanaWaterAccount({
      meterNumber: req.Message,
      mobileNumber: state.mobile
    });

    if (accountResponse.ResponseCode !== '0000') {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        `Account not found`
      );
    }

    state.meterNumber = req.Message;
    state.meterInfo = accountResponse.Data;
    
    // Extract SessionId from the query response
    const sessionIdData = accountResponse.Data?.find(item => item.Display === 'sessionId');
    if (sessionIdData) {
      state.sessionId = sessionIdData.Value;
    } 
    
    this.sessionManager.updateSession(req.SessionId, state);
    // Log current session state
    await this.loggingService.logSessionState(req.SessionId, req.Mobile, state, 'active');

    // Display account information before proceeding
    const accountInfo = this.formatGhanaWaterAccountInfo(accountResponse.Data);
    
    return this.responseBuilder.createResponse(
      req.SessionId,
      "Account Summary",
      accountInfo + "\n\n1. Confirm\n2. Cancel",
      "input",
      "text"
    );
  }

  /**
   * Handle utility step 5 (meter selection for ECG or meter number for Ghana Water)
   */
  async handleUtilityStep5(req: HBussdReq, state: SessionState): Promise<string> {
    if (state.utilityProvider === UtilityProvider.ECG) {
      return await this.handleECGMeterSelection(req, state);
    } else {
      return await this.handleGhanaWaterQuery(req, state);
    }
  }

  /**
   * Handle ECG meter selection
   */
  private async handleECGMeterSelection(req: HBussdReq, state: SessionState): Promise<string> {
    const meters = state.meterInfo || [];
    const selectedIndex = parseInt(req.Message) - 1;

    if (selectedIndex < 0 || selectedIndex >= meters.length) {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Please select a valid meter option"
      );
    }

    state.selectedMeter = meters[selectedIndex];
    state.meterNumber = meters[selectedIndex].Value;
    this.sessionManager.updateSession(req.SessionId, state);

    // Log current session state
    await this.loggingService.logSessionState(req.SessionId, req.Mobile, state, 'active');

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
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Please enter a valid amount greater than 0"
      );
    }

    if (amount < 1) {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Minimum top-up amount is GH₵1.00"
      );
    }

    state.amount = amount;
    state.totalAmount = amount;
    this.sessionManager.updateSession(req.SessionId, state);

    // Log current session state
    await this.loggingService.logSessionState(req.SessionId, req.Mobile, state, 'active');

    return this.responseBuilder.createDisplayResponse(
      req.SessionId,
      "Utility Top-Up",
      this.formatUtilityOrderSummary(state) + "\n\n"
    );
  }

  /**
   * Format Ghana Water account information
   */
  private formatGhanaWaterAccountInfo(data: any[]): string {
    const nameData = data.find(item => item.Display === 'name');
    const amountDueData = data.find(item => item.Display === 'amountDue');
    
    let info = "Account Details:\n";
    info += `Customer: ${nameData?.Value || 'N/A'}\n`;
    
    if (amountDueData) {
      const amount = parseFloat(amountDueData.Value);
      if (amount > 0) {
        info += `Amount Due: GHS -${amount.toFixed(2)}\n`;
      } else if (amount < 0) {
        info += `Credit Balance: GHS-${Math.abs(amount).toFixed(2)}\n`;
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
      return `ECG Power:\n\n` +
             `Provider: ${provider}\n` +
             `Meter: ${meter?.Display}\n` +
             `Customer: ${meter?.Value}\n` +
             `Amount: GHS${amount?.toFixed(2)}\n\n` +
             `1. Confirm\n2. Cancel`;
    } else {
      const meter = state.meterInfo?.[0];
      return `Ghana Water :\n\n` +
             `Provider: ${provider}\n` +
             `Meter: ${state.meterNumber}\n` +
             `Customer: ${meter?.Display || 'N/A'}\n` +
             `Amount: GHS${amount?.toFixed(2)}\n\n` +
             `1. Confirm\n2. Cancel`;
    }
  }

  /**
   * Validate mobile number format
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
      error: 'Must be a valid mobile number (e.g., 0550982034)' 
    };
  }

  /**
   * Validate meter number format
   */
  private validateMeterNumber(meterNumber: string): boolean {
    if (!meterNumber || meterNumber.trim().length === 0) {
      return false;
    }

    const cleaned = meterNumber.replace(/\s/g, '');
    return /^\d{8,15}$/.test(cleaned);
  }
}
