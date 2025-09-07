import { Injectable } from '@nestjs/common';
import { HBussdReq } from '../../../models/dto/hubtel/hb-ussd.dto';
import { NetworkProvider, BundleOption } from '../../../models/dto/bundle.dto';
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
  private readonly BUNDLES_PER_PAGE = 6;
  private readonly BUNDLES_PER_GROUP = 8;

  constructor(
    private readonly responseBuilder: ResponseBuilder,
    private readonly bundleService: BundleService,
    private readonly sessionManager: SessionManager,
    private readonly loggingService: UssdLoggingService,
  ) {}

  // Main flow methods
  async handleNetworkSelection(req: HBussdReq, state: SessionState): Promise<string> {
    const networkMap = { "1": NetworkProvider.MTN, "2": NetworkProvider.TELECEL, "3": NetworkProvider.AT };
    
    if (!networkMap[req.Message]) {
      return this.responseBuilder.createErrorResponse(req.SessionId, "Please select 1, 2, or 3");
    }

    state.network = networkMap[req.Message];
    this.updateSession(req.SessionId, state);
    await this.logInteraction(req, state, 'network_selected');

    return this.showBundleCategories(req.SessionId, state);
  }

  async handleBuyForSelection(req: HBussdReq, state: SessionState): Promise<string> {
    if (req.Message === "1") {
      state.flow = 'self';
      state.mobile = req.Mobile;
      // Debug: Log mobile number setting
      console.log('Setting mobile for self flow:', req.Mobile, 'State mobile:', state.mobile);
      this.updateSession(req.SessionId, state);
      await this.logInteraction(req, state, 'buy_for_self');
      // Show order summary directly
      return this.showOrderSummary(req.SessionId, state, req);
    }
    
    if (req.Message === "2") {
      state.flow = 'other';
      this.updateSession(req.SessionId, state);
      await this.logInteraction(req, state, 'buy_for_other');
      // Show mobile number input for "other" flow
      return this.responseBuilder.createPhoneInputResponse(
        req.SessionId, "Enter Mobile Number", "Enter recipient's mobile number:"
      );
    }
    
    return this.responseBuilder.createErrorResponse(req.SessionId, "Please select 1 for My Number or 2 for Other Number");
  }

  async handleBundleCategorySelection(req: HBussdReq, state: SessionState): Promise<string> {
    const groups = state.bundleGroups || [];
    const selectedIndex = parseInt(req.Message) - 1;

    if (selectedIndex < 0 || selectedIndex >= groups.length) {
      return this.responseBuilder.createErrorResponse(req.SessionId, "Please select a valid category");
    }

    state.currentGroupIndex = selectedIndex;
    state.currentBundlePage = 0;
    // Clear previous bundle selection when selecting a new category
    state.selectedBundle = undefined;
    state.bundleValue = undefined;
    state.amount = undefined;
    state.totalAmount = undefined;
    this.updateSession(req.SessionId, state);
    await this.logInteraction(req, state, 'category_selected');
    
    return this.showBundlePage(req.SessionId, state);
  }

  async handleBundleSelection(req: HBussdReq, state: SessionState): Promise<string> {
    const currentGroup = this.getCurrentGroup(state);
    if (!currentGroup) {
      return this.responseBuilder.createErrorResponse(req.SessionId, "No bundles available");
    }

    // Handle pagination
    if (req.Message === "0") return this.handleNextPage(req, state);
    if (req.Message === "00") return this.handlePrevPage(req, state);
    if (req.Message === "99") return this.handleBackToCategories(req, state);

    // Handle bundle selection
    const pageBundles = this.getPageBundles(currentGroup.bundles, state.currentBundlePage);
    const selectedIndex = parseInt(req.Message) - 1;

    if (selectedIndex < 0 || selectedIndex >= pageBundles.length) {
      return this.responseBuilder.createErrorResponse(req.SessionId, "Please select a valid bundle option");
    }

    this.selectBundle(state, pageBundles[selectedIndex]);
    this.updateSession(req.SessionId, state);
    await this.logInteraction(req, state, 'bundle_selected');  
    return this.showBuyForOptions(req.SessionId, state);
  }


  async handleBundleMobileNumber(req: HBussdReq, state: SessionState): Promise<string> {
    const validation = this.validateMobileNumber(req.Message);
    
    if (!validation.isValid) {
      return this.responseBuilder.createErrorResponse(req.SessionId, validation.error || "Invalid mobile number format");
    }

    state.mobile = validation.convertedNumber;
    // Debug: Log mobile number setting for other flow
    console.log('Setting mobile for other flow:', req.Message, 'Converted:', validation.convertedNumber, 'State mobile:', state.mobile);
    this.updateSession(req.SessionId, state);
    await this.logInteraction(req, state, 'mobile_entered');

    // Show order summary after mobile number input
    return this.showOrderSummary(req.SessionId, state, req);
  }

  // Display methods
  public showBuyForOptions(sessionId: string, state: SessionState): string {
    return this.responseBuilder.createNumberInputResponse(
      sessionId, "Who are you buying for?", "1. My Number\n2. Other Number\n\nSelect option:"
    );
  }

  public showOrderSummary(sessionId: string, state: SessionState, req?: HBussdReq): string {
    // Validate that a bundle is selected before showing order summary
    if (!state.selectedBundle) {
      return this.responseBuilder.createErrorResponse(
        sessionId, 
        "No bundle selected. Please select a bundle first."
      );
    }
    
    return this.responseBuilder.createDisplayResponse(
      sessionId, "Bundle", this.formatOrderSummary(state, req)
    );
  }

  // Private helper methods
  private async showBundleCategories(sessionId: string, state: SessionState): Promise<string> {
    try {
      const bundleResponse = await this.bundleService.queryBundles({
        destination: state.mobile || '233550982043',
        network: state.network,
        bundleType: 'data'
      });

      if (!bundleResponse?.Data?.length) {
        return this.responseBuilder.createErrorResponse(sessionId, "No bundles available for this network.");
      }

      // Debug: Log bundle data to understand structure
      console.log(`Bundle data for ${state.network}:`, bundleResponse.Data.slice(0, 5)); // Log first 5 bundles
      
      state.bundleGroups = this.groupBundlesByCategory(bundleResponse.Data, state.network);
      state.currentGroupIndex = 0;
      state.currentBundlePage = 0;
      this.updateSession(sessionId, state);

      return this.formatBundleCategories(sessionId, state);
    } catch (error) {
      console.error("Error fetching bundles:", error);
      return this.responseBuilder.createErrorResponse(sessionId, "Unable to fetch bundles. Please try again.");
    }
  }

  private showBundlePage(sessionId: string, state: SessionState): string {
    const currentGroup = this.getCurrentGroup(state);
    if (!currentGroup) {
      return this.responseBuilder.createErrorResponse(sessionId, "No bundles available in this package");
    }

    const pageBundles = this.getPageBundles(currentGroup.bundles, state.currentBundlePage);
    const totalPages = Math.ceil(currentGroup.bundles.length / this.BUNDLES_PER_PAGE);

    let menu = `${currentGroup.name}:\n`;
    pageBundles.forEach((bundle, index) => {
      // Format amount consistently
      const amount = bundle.Amount % 1 === 0 ? bundle.Amount.toString() : bundle.Amount.toFixed(2);
      // Extract just the data size from Display (remove price info if present)
      const displayText = this.cleanBundleDisplay(bundle.Display);
      menu += `${index + 1}. ${displayText} - GH${amount}\n`;
    });

    menu += "\n";
    if (state.currentBundlePage > 0) menu += "00. Previous\n";
    if (this.getPageBundles(currentGroup.bundles, state.currentBundlePage + 1).length > 0) menu += "0. Next\n";
    menu += "99. Back to Packages\n";

    return this.responseBuilder.createNumberInputResponse(
      sessionId, `Page ${state.currentBundlePage + 1} of ${totalPages}`, menu
    );
  }

  private formatBundleCategories(sessionId: string, state: SessionState): string {
    const groups = state.bundleGroups || [];
    const menu = "Select Bundle:\n\n" + 
      groups.map((group, index) => `${index + 1}. ${group.name} (${group.bundles.length} bundles)`).join('\n') +
      "\n\n99. Back";

    return this.responseBuilder.createNumberInputResponse(sessionId, "Bundle Packages", menu);
  }

  private formatOrderSummary(state: SessionState, req?: HBussdReq): string {
    const bundle = state.selectedBundle;
    const flow = state.flow === 'self' ? '(Self)' : '(Other)';
    
    // Debug: Log state information
    console.log('Order Summary - State mobile:', state.mobile, 'Flow:', state.flow, 'Bundle:', bundle?.Display);
    
    // Ensure mobile number is always available
    let mobileDisplay = state.mobile;
    if (!mobileDisplay && req) {
      // Fallback to request mobile number if state mobile is not set
      mobileDisplay = req.Mobile;
      console.log('Using fallback mobile from request:', mobileDisplay);
    }
    if (!mobileDisplay) {
      // This should not happen in normal flow, but we'll handle it gracefully
      mobileDisplay = 'Mobile number not set';
    }
    
    return `Bundle Order Summary:\n\n` +
      `Network: ${state.network}\n` +
      `Bundle: ${bundle?.Display}\n` +
      `Mobile: ${mobileDisplay} ${flow}\n` +
      `Amount: GH₵${state.amount || bundle?.Amount || 0}\n\n` +
      `1. Confirm\n2. Cancel`;
  }

  // Pagination handlers
  private handleNextPage(req: HBussdReq, state: SessionState): string {
    const currentGroup = this.getCurrentGroup(state);
    const nextPageBundles = this.getPageBundles(currentGroup.bundles, state.currentBundlePage + 1);
    
    if (nextPageBundles.length > 0) {
      state.currentBundlePage++;
      this.updateSession(req.SessionId, state);
      return this.showBundlePage(req.SessionId, state);
    }
    
    return this.responseBuilder.createErrorResponse(req.SessionId, "No more bundles to show");
  }

  private handlePrevPage(req: HBussdReq, state: SessionState): string {
    if (state.currentBundlePage > 0) {
      state.currentBundlePage--;
      this.updateSession(req.SessionId, state);
      return this.showBundlePage(req.SessionId, state);
    }
    
    return this.responseBuilder.createErrorResponse(req.SessionId, "Already on first page");
  }

  private handleBackToCategories(req: HBussdReq, state: SessionState): string {
    state.currentGroupIndex = 0;
    state.currentBundlePage = 0;
    // Clear previous bundle selection when going back to categories
    state.selectedBundle = undefined;
    state.bundleValue = undefined;
    state.amount = undefined;
    state.totalAmount = undefined;
    this.updateSession(req.SessionId, state);
    return this.formatBundleCategories(req.SessionId, state);
  }

  // Utility methods
  private getCurrentGroup(state: SessionState): BundleGroup | null {
    const groups = state.bundleGroups || [];
    return groups[state.currentGroupIndex] || null;
  }

  private getPageBundles(bundles: BundleOption[], page: number): BundleOption[] {
    const startIndex = page * this.BUNDLES_PER_PAGE;
    return bundles.slice(startIndex, startIndex + this.BUNDLES_PER_PAGE);
  }

  private selectBundle(state: SessionState, bundle: BundleOption): void {
    state.selectedBundle = bundle;
    state.bundleValue = bundle.Value;
    state.amount = bundle.Amount;
    state.totalAmount = bundle.Amount;
  }

  private updateSession(sessionId: string, state: SessionState): void {
    this.sessionManager.updateSession(sessionId, state);
  }

  private groupBundlesByCategory(bundles: BundleOption[], network: NetworkProvider): BundleGroup[] {
    const groups: { [key: string]: BundleOption[] } = {};

    bundles.forEach(bundle => {
      const category = this.getBundleCategory(bundle, network);
      groups[category] = groups[category] || [];
      groups[category].push(bundle);
    });

    // Sort bundles within each category by amount (ascending)
    Object.keys(groups).forEach(category => {
      groups[category].sort((a, b) => a.Amount - b.Amount);
    });

    // Debug: Log categorization results
    console.log(`Categorized bundles for ${network}:`, Object.keys(groups));
    Object.entries(groups).forEach(([category, bundles]) => {
      console.log(`${category}: ${bundles.length} bundles`);
    });

    // Return all bundles for each category (no limit, pagination will handle display)
    return Object.entries(groups).map(([name, bundles]) => ({
      name,
      bundles: bundles // Remove the slice limit to show all bundles
    }));
  }

  private getBundleCategory(bundle: BundleOption, network: NetworkProvider): string {
    const display = bundle.Display.toLowerCase();
    const value = bundle.Value.toLowerCase();

    // Network-specific categorization based on actual API data
    if (network === NetworkProvider.MTN) {
      // MTN Network Categories based on actual API data
      if (display.includes('kokrokoo') || value.includes('kokrokoo')) {
        return 'Kokrokoo Bundles';
      } else if (display.includes('video') || value.includes('video')) {
        return 'Video Bundles';
      } else if (display.includes('social media') || value.includes('social_media')) {
        return 'Social Media Bundles';
      } else if (display.includes('flexi') || value.includes('flexi')) {
        return 'Flexi Data Bundles';
      } else {
        return 'Data Bundles';
      }
    } else if (network === NetworkProvider.TELECEL) {
      // Telecel Network Categories based on actual API data
      if (display.includes('no expiry') && (display.includes('12am') || display.includes('5am'))) {
        return 'Night Bundles';
      } else if (display.includes('1 hour') || value.includes('hrboost')) {
        return 'Hour Boost';
      } else if (display.includes('no expiry') && !display.includes('12am') && !display.includes('5am')) {
        return 'No Expiry Bundles';
      } else if (display.includes('1 day') || display.includes('3 days') || display.includes('5 days') || 
                 display.includes('15 days') || display.includes('30 days')) {
        return 'Time-Based Bundles';
      } else {
        return 'Data Bundles';
      }
    } else if (network === NetworkProvider.AT) {
      // AT Network Categories based on actual API data
      if (display.includes('bigtime') || value.includes('bigtime')) {
        return 'BigTime Data';
      } else if (display.includes('fuse') || value.includes('fuse')) {
        return 'Fuse Bundles';
      } else if (display.includes('kokoo') || value.includes('kokoo')) {
        return 'Kokoo Bundles';
      } else if (display.includes('xxl') || value.includes('xxl')) {
        return 'XXL Family Bundles';
      } else {
        return 'Data Bundles';
      }
    }
    
    return 'Data Bundles';
  }

  private cleanBundleDisplay(display: string): string {
    // Remove price information from display text to avoid duplication
    // Examples:
    // "4.4GB(GHS 50)" -> "4.4GB"
    // "50MB(GHS 1)" -> "50MB"
    // "Video 156.01MB" -> "Video 156.01MB"
    // "No Expiry - 22MB (GHs 0.5)" -> "No Expiry - 22MB"
    
    return display
      .replace(/\(GHS?\s*\d+(?:\.\d+)?\)/gi, '') // Remove (GHS 50) or (GH 50)
      .replace(/\(GHs?\s*\d+(?:\.\d+)?\)/gi, '') // Remove (GHs 0.5) or (GH 0.5)
      .replace(/\(GH₵\s*\d+(?:\.\d+)?\)/gi, '') // Remove (GH₵ 50)
      .replace(/\s*-\s*GHs?\s*\d+(?:\.\d+)?/gi, '') // Remove - GHs 0.5
      .replace(/\s*-\s*GHS?\s*\d+(?:\.\d+)?/gi, '') // Remove - GHS 50
      .replace(/\s*-\s*GH₵\s*\d+(?:\.\d+)?/gi, '') // Remove - GH₵ 50
      .trim(); // Remove extra spaces
  }

  private validateMobileNumber(mobile: string): { isValid: boolean; convertedNumber?: string; error?: string } {
    const cleaned = mobile.replace(/\D/g, '');
    
    if (cleaned.length === 10 && cleaned.startsWith('0')) {
      return { isValid: true, convertedNumber: '233' + cleaned.substring(1) };
    }
    
    if (cleaned.length === 12 && cleaned.startsWith('233')) {
      return { isValid: true, convertedNumber: cleaned };
    }
    
    return { isValid: false, error: 'Must be a valid mobile number (e.g 0550982034)' };
  }

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
}