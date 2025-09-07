import { Injectable } from '@nestjs/common';
import { HBussdReq } from '../../../models/dto/hubtel/hb-ussd.dto';
import { NetworkProvider, BundleType, BundleOption } from '../../../models/dto/bundle.dto';
import { SessionState } from '../types';
import { ResponseBuilder } from '../response-builder';
import { BundleService } from '../../bundle.service';
import { SessionManager } from '../session-manager';
import { UssdLoggingService } from '../logging.service';

interface BundleGroup {
  name: string;
  bundles: BundleOption[];
}

@Injectable()
export class BundleHandler {
  private readonly BUNDLES_PER_PAGE = 3;
  private readonly BUNDLES_PER_GROUP = 8;

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

    return this.showBundleCategories(req.SessionId, state);
  }

  /**
   * Show bundle categories (Data Bundles, Kokrokoo Bundles, etc.)
   */
  private async showBundleCategories(sessionId: string, state: SessionState): Promise<string> {
    try {
      const bundleResponse = await this.bundleService.queryBundles({
        destination: state.mobile || '233550123456', // Use default for query
        network: state.network,
        bundleType: 'data'
      });

      if (!bundleResponse || !bundleResponse.Data || bundleResponse.Data.length === 0) {
        return this.responseBuilder.createErrorResponse(
          sessionId,
          "No bundles available for this network. Please try another network."
        );
      }

      // Group bundles by category with network context
      const groupedBundles = this.groupBundlesByCategory(bundleResponse.Data, state.network);
      
      // Store grouped bundles in session state
      state.bundleGroups = groupedBundles;
      state.currentGroupIndex = 0;
      state.currentBundlePage = 0;
      this.sessionManager.updateSession(sessionId, state);

      return this.formatBundleCategories(sessionId, state);
    } catch (error) {
      console.error("Error fetching bundles:", error);
      return this.responseBuilder.createErrorResponse(
        sessionId,
        "Unable to fetch bundles. Please try again."
      );
    }
  }

  /**
   * Handle bundle category selection
   */
  async handleBundleCategorySelection(req: HBussdReq, state: SessionState): Promise<string> {
    const groups = state.bundleGroups || [];
    const selectedIndex = parseInt(req.Message) - 1;

    if (selectedIndex < 0 || selectedIndex >= groups.length) {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Please select a valid category"
      );
    }

    state.currentGroupIndex = selectedIndex;
    state.currentBundlePage = 0;
    this.sessionManager.updateSession(req.SessionId, state);

    // Log category selection
    await this.logInteraction(req, state, 'category_selected');
    return this.showBundlePage(req.SessionId, state);
  }

  /**
   * Handle bundle selection with pagination
   */
  async handleBundleSelection(req: HBussdReq, state: SessionState): Promise<string> {
    const groups = state.bundleGroups || [];
    const currentGroup = groups[state.currentGroupIndex];
    
    if (!currentGroup) {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "No bundles available"
      );
    }

    const bundles = currentGroup.bundles;
    const startIndex = state.currentBundlePage * this.BUNDLES_PER_PAGE;
    const endIndex = startIndex + this.BUNDLES_PER_PAGE;
    const pageBundles = bundles.slice(startIndex, endIndex);

    const selectedIndex = parseInt(req.Message) - 1;

    if (req.Message === "0") {
      // Next page
      if (endIndex < bundles.length) {
        state.currentBundlePage++;
        this.sessionManager.updateSession(req.SessionId, state);
        return this.showBundlePage(req.SessionId, state);
      } else {
        return this.responseBuilder.createErrorResponse(
          req.SessionId,
          "No more bundles to show"
        );
      }
    } else if (req.Message === "00") {
      // Previous page
      if (state.currentBundlePage > 0) {
        state.currentBundlePage--;
        this.sessionManager.updateSession(req.SessionId, state);
        return this.showBundlePage(req.SessionId, state);
      } else {
        return this.responseBuilder.createErrorResponse(
          req.SessionId,
          "Already on first page"
        );
      }
    } else if (req.Message === "99") {
      // Back to categories
      state.currentGroupIndex = 0;
      state.currentBundlePage = 0;
      this.sessionManager.updateSession(req.SessionId, state);
      return this.formatBundleCategories(req.SessionId, state);
    }

    if (selectedIndex < 0 || selectedIndex >= pageBundles.length) {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Please select a valid bundle option"
      );
    }

    state.selectedBundle = pageBundles[selectedIndex];
    state.bundleValue = pageBundles[selectedIndex].Value;
    state.amount = pageBundles[selectedIndex].Amount;
    state.totalAmount = pageBundles[selectedIndex].Amount;
    this.sessionManager.updateSession(req.SessionId, state);

    // Log bundle selection
    await this.logInteraction(req, state, 'bundle_selected');

    return this.showPurchaseType(req.SessionId, state);
  }

  /**
   * Show purchase type (Self or Other)
   */
  private showPurchaseType(sessionId: string, state: SessionState): string {
    return this.responseBuilder.createResponse(
      sessionId,
      "Purchase Type",
      "Who is this bundle for?\n\n1. Self\n2. Other\n\nSelect option:",
      "input",
      "text"
    );
  }

  /**
   * Handle purchase type selection
   */
  async handlePurchaseTypeSelection(req: HBussdReq, state: SessionState): Promise<string> {
    if (req.Message === "1") {
      // Self purchase
      state.flow = 'self';
      state.mobile = req.Mobile; // Use current user's mobile
      this.sessionManager.updateSession(req.SessionId, state);
      
      await this.logInteraction(req, state, 'purchase_type_self');
      
      return this.showOrderSummary(req.SessionId, state);
    } else if (req.Message === "2") {
      // Other purchase
      state.flow = 'other';
      this.sessionManager.updateSession(req.SessionId, state);
      
      await this.logInteraction(req, state, 'purchase_type_other');
      
      return this.responseBuilder.createPhoneInputResponse(
        req.SessionId,
        "Enter Mobile Number",
        "Enter mobile number to purchase bundle (e.g., 0550982043):"
      );
    } else {
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Please select 1 for Self or 2 for Other"
      );
    }
  }

  /**
   * Handle mobile number input for other purchase
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

    return this.showOrderSummary(req.SessionId, state);
  }

  /**
   * Show order summary
   */
  public showOrderSummary(sessionId: string, state: SessionState): string {
    return this.responseBuilder.createDisplayResponse(
      sessionId,
      "Order Summary",
      this.formatBundleOrderSummary(state)
    );
  }

  /**
   * Group bundles by category based on network context
   */
  private groupBundlesByCategory(bundles: BundleOption[], network: NetworkProvider): BundleGroup[] {
    const groups: { [key: string]: BundleOption[] } = {};

    bundles.forEach(bundle => {
      const category = this.getBundleCategory(bundle, network);
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(bundle);
    });

    // Debug logging
    console.log(`Bundle Grouping Results for ${network}:`);
    Object.entries(groups).forEach(([category, bundleList]) => {
      console.log(`${category}: ${bundleList.length} bundles`);
      bundleList.slice(0, 3).forEach(bundle => {
        // console.log(`  - ${bundle.Display} (${bundle.Value})`);
      });
      if (bundleList.length > 3) {
        // console.log(`  ... and ${bundleList.length - 3} more`);
      }
    });

    return Object.entries(groups).map(([name, bundles]) => ({
      name,
      bundles: bundles.slice(0, this.BUNDLES_PER_GROUP)
    }));
  }

  /**
   * Determine bundle category based on bundle name and network context
   */
  private getBundleCategory(bundle: BundleOption, network: NetworkProvider): string {
    const display = bundle.Display.toLowerCase();
    const value = bundle.Value.toLowerCase();

    // Network-specific categorization to prevent mixing
    if (network === NetworkProvider.AT) {
      // AT Network Categories
      if (value.includes('bigtime') || display.includes('bigtime')) {
        return 'BigTime Data';
      } else if (value.includes('fuse') || display.includes('fuse')) {
        return 'Fuse Bundles';
      } else if (value.includes('kokoo') || display.includes('kokoo')) {
        return 'Kokoo Bundles';
      } else if (value.includes('xxl') || display.includes('xxl')) {
        return 'XXL Family Bundles';
      } else {
        return 'Data Bundles';
      }
    } else if (network === NetworkProvider.TELECEL) {
      // Telecel Network Categories
      if (value.includes('bnight') || display.includes('12am') || display.includes('5am')) {
        return 'Night Bundles';
      } else if (value.includes('hrboost') || display.includes('1 hour')) {
        return 'Hour Boost';
      } else if (display.includes('no expiry')) {
        return 'No Expiry Bundles';
      } else if (display.includes('1 day') || display.includes('3 days') || display.includes('5 days') || 
                 display.includes('15 days') || display.includes('30 days')) {
        return 'Time-Based Bundles';
      } else {
        return 'Data Bundles';
      }
    } else if (network === NetworkProvider.MTN) {
      // MTN Network Categories
      if (display.includes('kokrokoo') || value.includes('kokrokoo')) {
        return 'Kokrokoo Bundles';
      } else if (display.includes('video') || value.includes('video')) {
        return 'Video Bundles';
      } else if (display.includes('social') || value.includes('social')) {
        return 'Social Media Bundles';
      } else {
        return 'Data Bundles';
      }
    }
    
    // Default category for unknown networks
    return 'Data Bundles';
  }

  /**
   * Format bundle categories menu
   */
  private formatBundleCategories(sessionId: string, state: SessionState): string {
    const groups = state.bundleGroups || [];
    let menu = "Select Bundle Package:\n\n";
    
    groups.forEach((group, index) => {
      menu += `${index + 1}. ${group.name}\n`;
    });

    return this.responseBuilder.createNumberInputResponse(
      sessionId,
      "Bundle Packages",
      menu
    );
  }

  /**
   * Show bundle page with pagination
   */
  private showBundlePage(sessionId: string, state: SessionState): string {
    const groups = state.bundleGroups || [];
    const currentGroup = groups[state.currentGroupIndex];
    
    if (!currentGroup) {
      return this.responseBuilder.createErrorResponse(
        sessionId,
        "No bundles available in this package"
      );
    }

    const bundles = currentGroup.bundles;
    const startIndex = state.currentBundlePage * this.BUNDLES_PER_PAGE;
    const endIndex = startIndex + this.BUNDLES_PER_PAGE;
    const pageBundles = bundles.slice(startIndex, endIndex);
    const totalPages = Math.ceil(bundles.length / this.BUNDLES_PER_PAGE);

    let menu = `${currentGroup.name}:\n\n`;
    
    pageBundles.forEach((bundle, index) => {
      menu += `${index + 1}. ${bundle.Display} - GH${bundle.Amount}\n`;
    });

    // Add pagination controls
    menu += "\n";
    if (state.currentBundlePage > 0) {
      menu += "00. Previous Page\n";
    }
    if (endIndex < bundles.length) {
      menu += "0. Next Page\n";
    }
    menu += "99. Back to Packages\n";

    return this.responseBuilder.createNumberInputResponse(
      sessionId,
      `Page ${state.currentBundlePage + 1} of ${totalPages}`,
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
    const flow = state.flow;

    let summary = `Bundle Order Summary:\n\n`;
    summary += `Network: ${network}\n`;
    summary += `Bundle: ${bundle?.Display}\n`;
    
    if (flow === 'self') {
      summary += `Mobile: ${mobile} (Self)\n`;
    } else {
      summary += `Mobile: ${mobile} (Other)\n`;
    }
    
    summary += `Amount: GHS${bundle?.Amount || state.amount || 0}\n\n`;
    summary += `1. Confirm\n2. Cancel`;

    return summary;
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
      error: 'Must be a valid mobile number (e.g 0550982034)' 
    };
  }
}