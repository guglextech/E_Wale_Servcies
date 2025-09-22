import { Injectable } from "@nestjs/common";
import { HBussdReq } from "../../models/dto/hubtel/hb-ussd.dto";
import { SessionState, ServiceType } from "./types";
import { ResponseBuilder } from "./response-builder";
import { SessionManager } from "./session-manager";
import { UssdLoggingService } from "./logging.service";
import { TVBillsHandler } from "./handlers/tv-bills.handler";
import { AirtimeHandler } from "./handlers/airtime.handler";
import { UtilityHandler } from "./handlers/utility.handler";

@Injectable()
export class MenuHandler {
  constructor(
    private readonly responseBuilder: ResponseBuilder,
    private readonly sessionManager: SessionManager,
    private readonly loggingService: UssdLoggingService,
    private readonly tvBillsHandler: TVBillsHandler,
    private readonly airtimeHandler: AirtimeHandler,
    private readonly utilityHandler: UtilityHandler
  ) { }

  /**
   * Handle main menu selection
   */
  async handleMainMenuSelection(req: HBussdReq, state: SessionState): Promise<string> {
    if (req.Message === "0") {
      return this.responseBuilder.createContactUsResponse(req.SessionId);
    }

    const menuHandlers = {
      "1": () => this.handleServiceSelection(req, state, ServiceType.AIRTIME_TOPUP, "Select Network", "Enjoy an exclusive 100% bonus on select networks\nSelect Network:\n1. MTN\n2. Telecel Ghana\n3. AT"),
      "2": () => this.handleServiceSelection(req, state, ServiceType.DATA_BUNDLE, "Select Network", "Instant Exclusive Data Bundle\nSelect Network:\n1. MTN\n2. Telecel Ghana\n3. AT"),
      "3": () => this.handleServiceSelection(req, state, ServiceType.PAY_BILLS, "Select TV Provider", "Select TV Provider:\n1. DSTV\n2. GoTV\n3. StarTimes TV"),
      "4": () => this.handleServiceSelection(req, state, ServiceType.UTILITY_SERVICE, "Select Utility Service", "Select Utility Service:\n1. ECG Power\n2. Ghana Water"),
      "5": () => this.handleServiceSelection(req, state, ServiceType.RESULT_CHECKER, "Result E-Checkers", "Select Result Checker:\n1. BECE"),
      "6": () => this.handleComingSoon(req, state)
    };

    const handler = menuHandlers[req.Message];
    if (handler) {
      return await handler();
    }

    return this.responseBuilder.createInvalidSelectionResponse(
      req.SessionId,
      "Please select a valid option (1-5 or 0)"
    );
  }

  /**
   * Generic service selection handler
   */
  private async handleServiceSelection(
    req: HBussdReq,
    state: SessionState,
    serviceType: ServiceType,
    label: string,
    message: string
  ): Promise<string> {
    state.serviceType = serviceType;
    this.sessionManager.updateSession(req.SessionId, state);

    await this.logServiceSelection(req, state);

    return this.responseBuilder.createNumberInputResponse(req.SessionId, label, message);
  }

  /**
   * Handle coming soon services
   */
  private handleComingSoon(req: HBussdReq, state: SessionState): string {
    const serviceNames = {
      "6": "Other Services"
    };

    return this.responseBuilder.createComingSoonResponse(
      req.SessionId,
      serviceNames[req.Message]
    );
  }

  /**
   * Handle service type selection (step 3)
   */
  async handleServiceTypeSelection(req: HBussdReq, state: SessionState): Promise<string> {
    const handlers = {
      [ServiceType.RESULT_CHECKER]: () => this.handleResultCheckerServiceSelection(req, state),
      [ServiceType.DATA_BUNDLE]: () => this.handleDataBundleServiceSelection(req, state),
      [ServiceType.AIRTIME_TOPUP]: () => this.handleAirtimeServiceSelection(req, state),
      [ServiceType.PAY_BILLS]: () => this.handlePayBillsServiceSelection(req, state),
      [ServiceType.UTILITY_SERVICE]: () => this.handleUtilityServiceSelection(req, state)
    };

    const handler = handlers[state.serviceType];
    if (handler) {
      return await handler();
    }

    return this.responseBuilder.createErrorResponse(
      req.SessionId,
      "Invalid service type selected"
    );
  }

  /**
   * Handle result checker service selection
   */
  private handleResultCheckerServiceSelection(req: HBussdReq, state: SessionState): string {
    if (!["1", "2", "3"].includes(req.Message)) {
      return this.responseBuilder.createInvalidSelectionResponse(
        req.SessionId,
        "Please select 1, 2, or 3"
      );
    }

    const serviceMap = {
      "1": "BECE Checker Voucher",
      "2": "NovDec Checker",
      "3": "School Placement Checker"
    };

    state.service = serviceMap[req.Message];
    this.sessionManager.updateSession(req.SessionId, state);

    return this.responseBuilder.createNumberInputResponse(
      req.SessionId,
      "Who are you buying for?",
      "Buy for:\n1. Self\n2. Other"
    );
  }

  /**
   * Handle data bundle service selection
   */
  private handleDataBundleServiceSelection(req: HBussdReq, state: SessionState): string {
    return "BUNDLE_SELECTION_REQUIRED";
  }

  /**
   * Handle airtime service selection
   */
  private async handleAirtimeServiceSelection(req: HBussdReq, state: SessionState): Promise<string> {
    return await this.airtimeHandler.handleNetworkSelection(req, state);
  }

  /**
   * Handle pay bills service selection - delegates to TV bills handler
   */
  private async handlePayBillsServiceSelection(req: HBussdReq, state: SessionState): Promise<string> {
    return await this.tvBillsHandler.handleTVProviderSelection(req, state);
  }

  /**
   * Handle utility service selection - delegates to utility handler
   */
  private async handleUtilityServiceSelection(req: HBussdReq, state: SessionState): Promise<string> {
    return await this.utilityHandler.handleUtilityProviderSelection(req, state);
  }


  /**
   * Log service selection
   */
  private async logServiceSelection(req: HBussdReq, state: SessionState): Promise<void> {
    await this.loggingService.logSessionState(req.SessionId, req.Mobile, state, 'active');
  }
}
