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
    try {
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
      state.mobile = req.Mobile;
      this.sessionManager.updateSession(req.SessionId, state);

      await this.logInteraction(req, state, 'network_selected');

      return this.showBuyForOptions(req.SessionId, state);
    } catch (error) {
      console.error('Error in handleNetworkSelection:', error);
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "An error occurred while processing your selection. Please try again."
      );
    }
  }

  /**
   * Show buy for self or other options
   */
  private showBuyForOptions(sessionId: string, state: SessionState): string {
    return this.responseBuilder.createNumberInputResponse(
      sessionId,
      "Buy For",
      "Buy for:\n\n1. My Number\n2. Other Number\n\nSelect option:"
    );
  }

  /**
   * Handle buy for selection (self or other)
   */
  async handleBuyForSelection(req: HBussdReq, state: SessionState): Promise<string> {
    try {
      if (req.Message === "1") {
        state.flow = 'self';
        state.mobile = req.Mobile;
        this.sessionManager.updateSession(req.SessionId, state);
        
        await this.logInteraction(req, state, 'buy_for_self');
        
        return this.showBundleCategories(req.SessionId, state);
      } else if (req.Message === "2") {
        state.flow = 'other';
        this.sessionManager.updateSession(req.SessionId, state);
        
        await this.logInteraction(req, state, 'buy_for_other');
        
        return this.responseBuilder.createPhoneInputResponse(
          req.SessionId,
          "Enter Mobile Number",
          "Enter recipient's mobile number:"
        );
      } else {
        return this.responseBuilder.createErrorResponse(
          req.SessionId,
          "Please select 1 for My Number or 2 for Other Number"
        );
      }
    } catch (error) {
      console.error('Error in handleBuyForSelection:', error);
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "An error occurred. Please try again."
      );
    }
  }

  /**
   * Handle mobile number input for other purchase
   */
  async handleOtherMobileNumber(req: HBussdReq, state: SessionState): Promise<string> {
    try {
      const validation = this.validateMobileNumber(req.Message);
      
      if (!validation.isValid) {
        return this.responseBuilder.createErrorResponse(
          req.SessionId,
          validation.error || "Invalid mobile number format"
        );
      }

      state.mobile = validation.convertedNumber;
      this.sessionManager.updateSession(req.SessionId, state);

      await this.logInteraction(req, state, 'other_mobile_entered');

      return this.showBundleCategories(req.SessionId, state);
    } catch (error) {
      console.error('Error in handleOtherMobileNumber:', error);
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "An error occurred. Please try again."
      );
    }
  }

  /**
   * Show bundle categories
   */
  private async showBundleCategories(sessionId: string, state: SessionState): Promise<string> {
    try {
      const destination = state.mobile || '233550982043';
      
      if (!state.network) {
        return this.responseBuilder.createErrorResponse(
          sessionId,
          "Network not selected. Please try again."
        );
      }
      
      const bundleResponse = await this.bundleService.queryBundles({
        destination: destination,
        network: state.network,
        bundleType: 'data'
      });

      if (!bundleResponse || !bundleResponse.Data || bundleResponse.Data.length === 0) {
        return this.responseBuilder.createErrorResponse(
          sessionId,
          "No bundles available for this network. Please try another network."
        );
      }

      // Process bundles into groups
      const bundleGroups = this.processBundleGroups(bundleResponse, state.network);
      state.bundleGroups = bundleGroups;
      state.currentBundlePage = 0;
      state.currentGroupIndex = -1;
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
   * Process bundle groups from API response
   */
  private processBundleGroups(bundleResponse: any, network: NetworkProvider): BundleGroup[] {
    // If API has Groups structure, use it directly
    if (bundleResponse.Groups) {
      const groups: BundleGroup[] = [];
      
      Object.entries(bundleResponse.Groups).forEach(([groupName, bundles]) => {
        const bundleList = bundles as BundleOption[];
        
        // Split large groups into smaller ones (max 4 bundles per group)
        if (bundleList.length <= this.BUNDLES_PER_PAGE) {
          groups.push({
            name: groupName,
            bundles: bundleList
          });
        } else {
          const chunks = this.splitIntoChunks(bundleList, this.BUNDLES_PER_PAGE);
          chunks.forEach((chunk, index) => {
            const groupNameWithIndex = chunks.length === 1 ? groupName : `${groupName} ${index + 1}`;
            groups.push({
              name: groupNameWithIndex,
              bundles: chunk
            });
          });
        }
      });

      return groups;
    } else {
      // Fallback: manually group bundles
      return this.groupBundlesManually(bundleResponse.Data, network);
    }
  }

   /**
    * Manually group bundles when API doesn't provide Groups
    */
   private groupBundlesManually(bundles: BundleOption[], network: NetworkProvider): BundleGroup[] {
     const groups: { [key: string]: BundleOption[] } = {};

     bundles.forEach(bundle => {
       const category = this.getBundleCategory(bundle, network);
       if (!groups[category]) {
         groups[category] = [];
       }
       groups[category].push(bundle);
     });

     // Split large categories
     const finalGroups: BundleGroup[] = [];
     Object.entries(groups).forEach(([category, bundleList]) => {
       if (bundleList.length <= this.BUNDLES_PER_PAGE) {
         finalGroups.push({
           name: category,
           bundles: bundleList
         });
       } else {
         const chunks = this.splitIntoChunks(bundleList, this.BUNDLES_PER_PAGE);
         chunks.forEach((chunk, index) => {
           const categoryName = chunks.length === 1 ? category : `${category} ${index + 1}`;
           finalGroups.push({
             name: categoryName,
             bundles: chunk
           });
         });
       }
     });

     return finalGroups;
   }

  /**
   * Split array into chunks
   */
  private splitIntoChunks<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

   /**
    * Determine bundle category based on bundle name and network
    */
   private getBundleCategory(bundle: BundleOption, network: NetworkProvider): string {
     const display = bundle.Display.toLowerCase();
     const value = bundle.Value.toLowerCase();

     // AT Network Categories
     if (network === NetworkProvider.AT) {
       // BigTime Data - bundles with (GHS X) format or specific patterns
       if (display.includes('(ghs') || value.includes('bigtime') || value.includes('data1') || 
           value.includes('data2') || value.includes('data5') || value.includes('data10') || 
           value.includes('data20') || value.includes('data50')) {
         return 'BigTime Data';
       }
       // Fuse Bundles - bundles with "mins" and "MB" 
       else if (display.includes('mins') && display.includes('mb') || value.includes('fuse')) {
         return 'Fuse Bundles';
       }
       // Kokoo Bundles - bundles with "kokoo" or "sika_kokoo"
       else if (display.includes('kokoo') || value.includes('kokoo') || value.includes('sika_kokoo')) {
         return 'Kokoo Bundles';
       }
       // XXL Family Pack - bundles with "xxl" or "family"
       else if (display.includes('xxl') || display.includes('family')) {
         return 'XXL Family Pack';
       }
       // Default for AT
       return 'BigTime Data';
     }
     
     // MTN Network Categories
     else if (network === NetworkProvider.MTN) {
       // Kokrokoo Bundles - time-based bundles (5am to 8am)
       if (display.includes('kokrokoo') || display.includes('5am') || display.includes('8am')) {
         return 'Kokrokoo Bundles';
       }
       // Video Bundles - bundles with "video" or video-related terms
       else if (display.includes('video') || value.includes('video')) {
         return 'Video Bundles';
       }
       // Social Media Bundles - bundles with "social" or social platform names
       else if (display.includes('social') || value.includes('social')) {
         return 'Social Media Bundles';
       }
       // Flexi Data Bundles - flexible data bundles
       else if (display.includes('flexi') || value.includes('flexi')) {
         return 'Flexi Data Bundles';
       }
       // Default for MTN
       return 'Kokrokoo Bundles';
     }
     
     // Telecel Network Categories
     else if (network === NetworkProvider.TELECEL) {
       // Night Bundles - specific night time patterns
       if (display.includes('12am') || display.includes('5am') || display.includes('night') || 
           value.includes('bnight')) {
         return 'Night Bundles';
       }
       // Hour Boost - specific hour patterns
       else if (display.includes('1 hour') || display.includes('hour') || value.includes('hrboost')) {
         return 'Hour Boost';
       }
       // No Expiry Bundles - specific no expiry pattern
       else if (display.includes('no expiry') || value.includes('datanv')) {
         return 'No Expiry Bundles';
       }
       // Time-Based Bundles - specific day patterns only
       else if (display.includes('1 day') || display.includes('3 days') || display.includes('5 days') || 
                display.includes('15 days') || display.includes('30 days') || value.includes('databund') || 
                value.includes('btboss')) {
         return 'Time-Based Bundles';
       }
       // Default for Telecel
       return 'No Expiry Bundles';
     }
     
     // Default category for unmatched bundles
     return 'Data Bundles';
   }

  /**
   * Format bundle categories menu
   */
  private formatBundleCategories(sessionId: string, state: SessionState): string {
    try {
      const groups = state.bundleGroups || [];
      
      if (groups.length === 0) {
        return this.responseBuilder.createErrorResponse(
          sessionId,
          "No bundle packages available. Please try another network."
        );
      }
      
      let menu = "Select Bundle Package:\n\n";
      
      groups.forEach((group, index) => {
        menu += `${index + 1}. ${group.name}\n`;
      });

      menu += "\n99. Back\n";

      return this.responseBuilder.createNumberInputResponse(
        sessionId,
        "Bundle Packages",
        menu
      );
    } catch (error) {
      console.error('Error formatting bundle categories:', error);
      return this.responseBuilder.createErrorResponse(
        sessionId,
        "Error displaying bundle packages. Please try again."
      );
    }
  }

  /**
   * Handle bundle category selection
   */
  async handleBundleCategorySelection(req: HBussdReq, state: SessionState): Promise<string> {
    try {
      // Handle back to network selection
      if (req.Message === "99") {
        return this.responseBuilder.createNumberInputResponse(
          req.SessionId,
          "Select Network",
          "Select Network:\n\n1. MTN\n2. Telecel Ghana\n3. AT\n\nSelect option:"
        );
      }

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

      await this.logInteraction(req, state, 'category_selected');

      return this.showBundlePage(req.SessionId, state);
    } catch (error) {
      console.error('Error in handleBundleCategorySelection:', error);
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "An error occurred. Please try again."
      );
    }
  }

  /**
   * Show bundle page
   */
  private showBundlePage(sessionId: string, state: SessionState): string {
    try {
      const groups = state.bundleGroups || [];
      
      if (!groups || groups.length === 0) {
        return this.responseBuilder.createErrorResponse(
          sessionId,
          "No bundles available"
        );
      }

      const currentGroup = groups[state.currentGroupIndex];
      if (!currentGroup) {
        return this.responseBuilder.createErrorResponse(
          sessionId,
          "No bundle group selected"
        );
      }

      const bundles = currentGroup.bundles;

      let menu = `${currentGroup.name} (${state.network}):\n\n`;
      
      bundles.forEach((bundle, index) => {
        menu += `${index + 1}. ${bundle.Display} - GH${bundle.Amount}\n`;
      });

      menu += "\n99. Back\n";

      return this.responseBuilder.createNumberInputResponse(
        sessionId,
        currentGroup.name,
        menu
      );
    } catch (error) {
      console.error('Error in showBundlePage:', error);
      return this.responseBuilder.createErrorResponse(
        sessionId,
        "Error displaying bundles. Please try again."
      );
    }
  }

  /**
   * Handle bundle selection
   */
  async handleBundleSelection(req: HBussdReq, state: SessionState): Promise<string> {
    try {
      const groups = state.bundleGroups || [];
      
      if (!groups || groups.length === 0) {
        return this.responseBuilder.createErrorResponse(
          req.SessionId,
          "No bundles available"
        );
      }

      const currentGroup = groups[state.currentGroupIndex];
      if (!currentGroup) {
        return this.responseBuilder.createErrorResponse(
          req.SessionId,
          "No bundle group selected"
        );
      }

      const bundles = currentGroup.bundles;

      // Handle back to category selection
      if (req.Message === "99") {
        return this.formatBundleCategories(req.SessionId, state);
      }

      // Handle bundle selection
      const selectedIndex = parseInt(req.Message) - 1;

      if (selectedIndex < 0 || selectedIndex >= bundles.length) {
        return this.responseBuilder.createErrorResponse(
          req.SessionId,
          "Please select a valid bundle option"
        );
      }

      // Set the selected bundle
      const selectedBundle = bundles[selectedIndex];
      state.selectedBundle = selectedBundle;
      state.bundleValue = selectedBundle.Value;
      state.amount = selectedBundle.Amount;
      state.totalAmount = selectedBundle.Amount;
      
      this.sessionManager.updateSession(req.SessionId, state);

      await this.logInteraction(req, state, 'bundle_selected');

      return this.showOrderSummary(req.SessionId, state);
    } catch (error) {
      console.error('Error in handleBundleSelection:', error);
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "An error occurred while selecting bundle. Please try again."
      );
    }
  }

  /**
   * Show order summary
   */
  async showOrderSummary(sessionId: string, state: SessionState): Promise<string> {
    return this.responseBuilder.createDisplayResponse(
      sessionId,
      "Order Summary",
      this.formatBundleOrderSummary(state)
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

    let summary = `Bundle Package:\n\n`;
    summary += `Network: ${network || 'N/A'}\n`;
    summary += `Bundle: ${bundle?.Display || 'N/A'}\n`;
    
    if (flow === 'self') {
      summary += `Mobile: ${mobile || 'N/A'} (Self)\n`;
    } else {
      summary += `Mobile: ${mobile || 'N/A'} (Other)\n`;
    }
    
    const amount = bundle?.Amount || state.amount || 'N/A';
    summary += `Amount: GH${amount}\n\n`;
    summary += `1. Confirm\n2. Cancel`;

    return summary;
  }

  /**
   * Log USSD interaction
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
      error: 'Must be a valid mobile number' 
    };
  }
}