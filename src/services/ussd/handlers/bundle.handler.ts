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
  private readonly BUNDLES_PER_PAGE = 4;
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
      this.updateSession(req.SessionId, state);
      await this.logInteraction(req, state, 'buy_for_self');
      return this.showBundleCategories(req.SessionId, state);
    }
    
    if (req.Message === "2") {
      state.flow = 'other';
      this.updateSession(req.SessionId, state);
      await this.logInteraction(req, state, 'buy_for_other');
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

    return this.showOrderSummary(req.SessionId, state);
  }

  async handleBundleMobileNumber(req: HBussdReq, state: SessionState): Promise<string> {
    const validation = this.validateMobileNumber(req.Message);
    
    if (!validation.isValid) {
      return this.responseBuilder.createErrorResponse(req.SessionId, validation.error || "Invalid mobile number format");
    }

    state.mobile = validation.convertedNumber;
    this.updateSession(req.SessionId, state);
    await this.logInteraction(req, state, 'mobile_entered');

    return this.showOrderSummary(req.SessionId, state);
  }

  // Display methods
  public showBuyForOptions(sessionId: string, state: SessionState): string {
    return this.responseBuilder.createNumberInputResponse(
      sessionId, "Who are you buying for?", "1. My Number\n2. Other Number\n\nSelect option:"
    );
  }

  public showOrderSummary(sessionId: string, state: SessionState): string {
    return this.responseBuilder.createDisplayResponse(
      sessionId, "Bundle", this.formatOrderSummary(state)
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

    let menu = `${currentGroup.name}:\n\n`;
    pageBundles.forEach((bundle, index) => {
      menu += `${index + 1}. ${bundle.Display} - GH${bundle.Amount}\n`;
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
    const menu = "Select Bundle Package:\n\n" + 
      groups.map((group, index) => `${index + 1}. ${group.name}`).join('\n');

    return this.responseBuilder.createNumberInputResponse(sessionId, "Bundle Packages", menu);
  }

  private formatOrderSummary(state: SessionState): string {
    const bundle = state.selectedBundle;
    const flow = state.flow === 'self' ? '(Self)' : '(Other)';
    
    return `Bundle Order Summary:\n\n` +
      `Network: ${state.network}\n` +
      `Bundle: ${bundle?.Display}\n` +
      `Mobile: ${state.mobile} ${flow}\n` +
      `Amount: GHS${bundle?.Amount || state.amount || 0}\n\n` +
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

    return Object.entries(groups).map(([name, bundles]) => ({
      name,
      bundles: bundles.slice(0, this.BUNDLES_PER_GROUP)
    }));
  }

  private getBundleCategory(bundle: BundleOption, network: NetworkProvider): string {
    const display = bundle.Display.toLowerCase();
    const value = bundle.Value.toLowerCase();

    const categoryMap = {
      [NetworkProvider.AT]: {
        'bigtime': 'BigTime Data',
        'fuse': 'Fuse Bundles',
        'kokoo': 'Kokoo Bundles',
        'xxl': 'XXL Family Bundles'
      },
      [NetworkProvider.TELECEL]: {
        'bnight': 'Night Bundles',
        'hrboost': 'Hour Boost',
        'no expiry': 'No Expiry Bundles',
        'time-based': 'Time-Based Bundles'
      },
      [NetworkProvider.MTN]: {
        'kokrokoo': 'Kokrokoo Bundles',
        'video': 'Video Bundles',
        'social': 'Social Media Bundles'
      }
    };

    const networkCategories = categoryMap[network] || {};
    
    for (const [keyword, category] of Object.entries(networkCategories)) {
      if (value.includes(keyword) || display.includes(keyword)) {
        return category as string;
      }
    }

    return 'Data Bundles';
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