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

    // Log utility provider selection
    await this.logInteraction(req, state, 'utility_provider_selected');

    if (state.utilityProvider === UtilityProvider.ECG) {
      return this.responseBuilder.createPhoneInputResponse(
        req.SessionId,
        "Enter Mobile Number",
        "Enter mobile number linked to ECG meter (e.g., 0550982034):"
      );
    } else {
      return this.responseBuilder.createNumberInputResponse(
        req.SessionId,
        "Enter Meter Number",
        "Enter Ghana Water meter number:"
      );
    }
  }

  /**
   * Handle utility query (ECG mobile number or Ghana Water meter number)
   */
  async handleUtilityQuery(req: HBussdReq, state: SessionState): Promise<string> {
    try {
      if (state.utilityProvider === UtilityProvider.ECG) {
        return await this.handleECGQuery(req, state);
      } else {
        return await this.handleGhanaWaterQuery(req, state);
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

    // Query ECG meters
    const meterResponse: UtilityQueryResponse = await this.utilityService.queryECGMeters({
      mobileNumber: validation.convertedNumber
    });

    if (meterResponse.ResponseCode !== '0000') {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        `No meters found: ${meterResponse.Message}`
      );
    }

    // Store meter info in session
    state.mobile = validation.convertedNumber;
    state.meterInfo = meterResponse.Data;
    this.sessionManager.updateSession(req.SessionId, state);

    // Log ECG query
    await this.logInteraction(req, state, 'ecg_queried');

    return this.responseBuilder.createNumberInputResponse(
      req.SessionId,
      "Select Meter",
      this.formatECGMeterMenu(state)
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

    // Query Ghana Water account
    const accountResponse: UtilityQueryResponse = await this.utilityService.queryGhanaWaterAccount({
      meterNumber: req.Message,
      mobileNumber: state.mobile || ''
    });

    if (accountResponse.ResponseCode !== '0000') {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        `Account not found: ${accountResponse.Message}`
      );
    }

    // Store account info in session
    state.meterNumber = req.Message;
    state.meterInfo = accountResponse.Data;
    this.sessionManager.updateSession(req.SessionId, state);

    // Log Ghana Water query
    await this.logInteraction(req, state, 'ghana_water_queried');

    return this.responseBuilder.createDecimalInputResponse(
      req.SessionId,
      "Enter Amount",
      "Enter top-up amount:"
    );
  }

  /**
   * Handle utility step 5 (meter selection for ECG or amount for Ghana Water)
   */
  async handleUtilityStep5(req: HBussdReq, state: SessionState): Promise<string> {
    if (state.utilityProvider === UtilityProvider.ECG) {
      return this.handleECGMeterSelection(req, state);
    } else {
      return this.handleUtilityAmountInput(req, state);
    }
  }

  /**
   * Handle ECG meter selection
   */
  private handleECGMeterSelection(req: HBussdReq, state: SessionState): string {
    const meters = state.meterInfo || [];
    const selectedIndex = parseInt(req.Message) - 1;

    if (selectedIndex < 0 || selectedIndex >= meters.length) {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Please select a valid meter option"
      );
    }

    state.selectedMeter = meters[selectedIndex];
    this.sessionManager.updateSession(req.SessionId, state);

    // Log meter selection
    this.logInteraction(req, state, 'meter_selected');

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
    this.sessionManager.updateSession(req.SessionId, state);

    // Log amount input
    await this.logInteraction(req, state, 'amount_entered');

    return this.responseBuilder.createDisplayResponse(
      req.SessionId,
      "Order Summary",
      this.formatUtilityOrderSummary(state)
    );
  }

  /**
   * Format ECG meter menu
   */
  private formatECGMeterMenu(state: SessionState): string {
    const meters = state.meterInfo || [];
    let menu = "Select Meter:\n";
    
    meters.forEach((meter, index) => {
      menu += `${index + 1}. ${meter.Display} - ${meter.Value}\n`;
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
      return `ECG Top-Up Order Summary:\n\n` +
             `Provider: ${provider}\n` +
             `Meter: ${meter?.Display}\n` +
             `Customer: ${meter?.Value}\n` +
             `Amount: GH₵${amount?.toFixed(2)}\n\n` +
             `Press 1 to confirm payment`;
    } else {
      const meter = state.meterInfo?.[0];
      return `Ghana Water Top-Up Order Summary:\n\n` +
             `Provider: ${provider}\n` +
             `Meter: ${state.meterNumber}\n` +
             `Customer: ${meter?.Display || 'N/A'}\n` +
             `Amount: GH₵${amount?.toFixed(2)}\n\n` +
             `Press 1 to confirm payment`;
    }
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
      error: 'Must be a valid Ghanaian mobile number (e.g., 0550982034)' 
    };
  }

  /**
   * Validate meter number format
   */
  private validateMeterNumber(meterNumber: string): boolean {
    if (!meterNumber || meterNumber.trim().length === 0) {
      return false;
    }

    // Basic validation for meter numbers (can be enhanced)
    const cleaned = meterNumber.replace(/\s/g, '');
    return /^\d{8,15}$/.test(cleaned);
  }
}
