import { Injectable } from "@nestjs/common";
import { HBussdReq } from "../../models/dto/hubtel/hb-ussd.dto";
import { SessionState, ServiceType } from "./types";
import { ResponseBuilder } from "./response-builder";
import { SessionManager } from "./session-manager";
import { UssdLoggingService } from "./logging.service";
import { NetworkProvider } from "../../models/dto/airtime.dto";
import { TVProvider } from "../../models/dto/tv-bills.dto";
import { UtilityProvider } from "../../models/dto/utility.dto";

@Injectable()
export class MenuHandler {
  constructor(
    private readonly responseBuilder: ResponseBuilder,
    private readonly sessionManager: SessionManager,
    private readonly loggingService: UssdLoggingService
  ) {}

  /**
   * Handle main menu selection
   */
  async handleMainMenuSelection(req: HBussdReq, state: SessionState): Promise<string> {
    if (req.Message === "0") {
      return this.responseBuilder.createContactUsResponse(req.SessionId);
    }

    const menuHandlers = {
      "1": () => this.handleServiceSelection(req, state, ServiceType.RESULT_CHECKER, "Result E-Checkers", "Select Result Checker:\n1. BECE \n2. WASSCE/NovDec \n3. School Placement Checker"),
      "2": () => this.handleServiceSelection(req, state, ServiceType.DATA_BUNDLE, "Select Network", "Select Network:\n1. MTN\n2. Telecel Ghana\n3. AT"),
      "3": () => this.handleServiceSelection(req, state, ServiceType.AIRTIME_TOPUP, "Select Network", "Select Network:\n1. MTN\n2. Telecel Ghana\n3. AT"),
      "4": () => this.handleServiceSelection(req, state, ServiceType.PAY_BILLS, "Select TV Provider", "Select TV Provider:\n1. DSTV\n2. GoTV\n3. StarTimes TV"),
      "5": () => this.handleServiceSelection(req, state, ServiceType.UTILITY_SERVICE, "Select Utility Service", "Select Utility Service:\n1. ECG Prepaid\n2. Ghana Water"),
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
  handleServiceTypeSelection(req: HBussdReq, state: SessionState): string {
    const handlers = {
      [ServiceType.RESULT_CHECKER]: () => this.handleResultCheckerServiceSelection(req, state),
      [ServiceType.DATA_BUNDLE]: () => this.handleDataBundleServiceSelection(req, state),
      [ServiceType.AIRTIME_TOPUP]: () => this.handleAirtimeServiceSelection(req, state),
      [ServiceType.PAY_BILLS]: () => this.handlePayBillsServiceSelection(req, state),
      [ServiceType.UTILITY_SERVICE]: () => this.handleUtilityServiceSelection(req, state)
    };

    const handler = handlers[state.serviceType];
    if (handler) {
      return handler();
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
      "Buying For",
      "Buy for:\n1. Buy for me\n2. For other"
    );
  }

  /**
   * Handle data bundle service selection
   */
  private handleDataBundleServiceSelection(req: HBussdReq, state: SessionState): string {
    return this.handleNetworkSelection(req, state, "Please select 1, 2, or 3");
  }

  /**
   * Handle airtime service selection
   */
  private handleAirtimeServiceSelection(req: HBussdReq, state: SessionState): string {
    const result = this.handleNetworkSelection(req, state, "Please select 1, 2, or 3");
    if (result === "SUCCESS") {
      return this.responseBuilder.createPhoneInputResponse(
        req.SessionId,
        "Enter Mobile Number",
        "Enter recipient mobile number:"
      );
    }
    return result;
  }

  /**
   * Handle pay bills service selection
   */
  private handlePayBillsServiceSelection(req: HBussdReq, state: SessionState): string {
    if (!["1", "2", "3"].includes(req.Message)) {
      return this.responseBuilder.createInvalidSelectionResponse(
        req.SessionId,
        "Please select 1, 2, or 3"
      );
    }

    const tvProviderMap = {
      "1": TVProvider.DSTV,
      "2": TVProvider.GOTV,
      "3": TVProvider.STARTIMES
    };

    state.tvProvider = tvProviderMap[req.Message];
    this.sessionManager.updateSession(req.SessionId, state);

    return this.responseBuilder.createResponse(
      req.SessionId,
      "Enter Account Number",
      "Enter TV account number:",
      "INPUT",
      "TEXT"
    );
  }

  /**
   * Handle utility service selection
   */
  private handleUtilityServiceSelection(req: HBussdReq, state: SessionState): string {
    if (!["1", "2"].includes(req.Message)) {
      return this.responseBuilder.createInvalidSelectionResponse(
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

    if (state.utilityProvider === UtilityProvider.ECG) {
      return this.responseBuilder.createPhoneInputResponse(
        req.SessionId,
        "Enter Mobile Number",
        "Enter mobile number linked to ECG meter:"
      );
    } else {
      return this.responseBuilder.createPhoneInputResponse(
        req.SessionId,
        "Enter Mobile Number",
        "Enter mobile number linked to Ghana Water meter:"
      );
    }
  }

  /**
   * Generic network selection handler
   */
  private handleNetworkSelection(req: HBussdReq, state: SessionState, errorMessage: string): string {
    if (!["1", "2", "3"].includes(req.Message)) {
      return this.responseBuilder.createInvalidSelectionResponse(
        req.SessionId,
        errorMessage
      );
    }

    const networkMap = {
      "1": NetworkProvider.MTN,
      "2": NetworkProvider.TELECEL,
      "3": NetworkProvider.AT
    };

    state.network = networkMap[req.Message];
    this.sessionManager.updateSession(req.SessionId, state);

    if (state.serviceType === ServiceType.DATA_BUNDLE) {
      return "BUNDLE_SELECTION_REQUIRED";
    }

    return "SUCCESS";
  }

  /**
   * Log service selection
   */
  private async logServiceSelection(req: HBussdReq, state: SessionState): Promise<void> {
    await this.loggingService.logUssdInteraction({
      mobileNumber: req.Mobile,
      sessionId: req.SessionId,
      sequence: req.Sequence,
      message: req.Message,
      serviceType: state.serviceType,
      status: 'service_selected',
      userAgent: 'USSD',
      deviceInfo: 'Mobile USSD',
      location: 'Ghana'
    });
  }
}
