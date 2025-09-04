import { Injectable } from '@nestjs/common';
import { HBussdReq } from '../../../models/dto/hubtel/hb-ussd.dto';
import { NetworkProvider, BundleType } from '../../../models/dto/bundle.dto';
import { BundleOption, BundleQueryResponse } from '../../../models/dto/bundle.dto';
import { SessionState } from '../types';
import { ResponseBuilder } from '../response-builder';
import { BundleService } from '../../bundle.service';
import { SessionManager } from '../session-manager';
import { UssdLoggingService } from '../logging.service';

@Injectable()
export class BundleHandler {
  constructor(
    private readonly responseBuilder: ResponseBuilder,
    private readonly bundleService: BundleService,
    private readonly sessionManager: SessionManager,
    private readonly loggingService: UssdLoggingService,
  ) {}

  /**
   * Handle network selection for bundle service
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

    // Log network selection
    await this.logInteraction(req, state, 'network_selected');

    return this.showNetworkBundles(req.SessionId, state);
  }

  /**
   * Show available bundles for selected network
   */
  private async showNetworkBundles(sessionId: string, state: SessionState): Promise<string> {
    try {
      const bundleResponse = await this.bundleService.queryBundles({
        destination: state.mobile || '',
        network: state.network,
        bundleType: 'data'
      });

      if (!bundleResponse || !bundleResponse.Data || bundleResponse.Data.length === 0) {
        return this.responseBuilder.createErrorResponse(
          sessionId,
          "No bundles available for this network. Please try another network."
        );
      }

      // Store bundles in session state
      state.bundles = bundleResponse.Data;
      state.currentBundlePage = 0;
      this.sessionManager.updateSession(sessionId, state);

      return this.formatBundleMenu(sessionId, state);
    } catch (error) {
      console.error("Error fetching bundles:", error);
      return this.responseBuilder.createErrorResponse(
        sessionId,
        "Unable to fetch bundles. Please try again."
      );
    }
  }

  /**
   * Handle bundle selection
   */
  async handleBundleSelection(req: HBussdReq, state: SessionState): Promise<string> {
    const bundles = state.bundles || [];
    const selectedIndex = parseInt(req.Message) - 1;

    if (selectedIndex < 0 || selectedIndex >= bundles.length) {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Please select a valid bundle option"
      );
    }

    state.selectedBundle = bundles[selectedIndex];
    state.bundleValue = bundles[selectedIndex].Value;
    this.sessionManager.updateSession(req.SessionId, state);

    // Log bundle selection
    await this.logInteraction(req, state, 'bundle_selected');

    return this.responseBuilder.createPhoneInputResponse(
      req.SessionId,
      "Enter Mobile Number",
      "Enter mobile number to purchase bundle (e.g., 0550982043):"
    );
  }

  /**
   * Handle mobile number input for bundle
   */
  async handleBundleMobileNumber(req: HBussdReq, state: SessionState): Promise<string> {
    const validation = this.validateMobileNumber(req.Message);
    
    if (!validation.isValid) {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        validation.error || "Invalid mobile number format"
      );
    }

    state.mobile = validation.convertedNumber;
    this.sessionManager.updateSession(req.SessionId, state);

    // Log mobile number input
    await this.logInteraction(req, state, 'mobile_entered');

    return this.responseBuilder.createDisplayResponse(
      req.SessionId,
      "Order Summary",
      this.formatBundleOrderSummary(state)
    );
  }

  /**
   * Format bundle menu for display
   */
  private formatBundleMenu(sessionId: string, state: SessionState): string {
    const bundles = state.bundles || [];
    let menu = "Select Bundle:\n";
    
    bundles.forEach((bundle, index) => {
      menu += `${index + 1}. ${bundle.Display} - GH₵${bundle.Amount}\n`;
    });

    return this.responseBuilder.createNumberInputResponse(
      sessionId,
      "Available Bundles",
      menu
    );
  }

  /**
   * Format bundle order summary
   */
  private formatBundleOrderSummary(state: SessionState): string {
    const bundle = state.selectedBundle;
    const mobile = state.mobile;
    const network = state.network;

    return `Bundle Summary:\n\n` +
           `Network: ${network}\n` +
           `Bundle: ${bundle?.Display}\n` +
           `Mobile: ${mobile}\n` +
           `Amount: GH${bundle?.Amount}\n\n` +
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
}
