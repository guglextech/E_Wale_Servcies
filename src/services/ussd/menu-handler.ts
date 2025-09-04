import { Injectable } from "@nestjs/common";
import { HBussdReq } from "../../models/dto/hubtel/hb-ussd.dto";
import { SessionState, ServiceType, FlowType } from "./types";
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
      "1": () => this.handleResultCheckerSelection(req, state),
      "2": () => this.handleDataBundleSelection(req, state),
      "3": () => this.handleAirtimeSelection(req, state),
      "4": () => this.handlePayBillsSelection(req, state),
      "5": () => this.handleUtilitySelection(req, state),
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
   * Handle result checker selection
   */
  private async handleResultCheckerSelection(req: HBussdReq, state: SessionState): Promise<string> {
    state.serviceType = ServiceType.RESULT_CHECKER;
    this.sessionManager.updateSession(req.SessionId, state);
    
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
    
    return this.responseBuilder.createNumberInputResponse(
      req.SessionId,
      "Result E-Checkers",
      "Select Result Checker:\n1. BECE \n2. WASSCE/NovDec \n3. School Placement Checker"
    );
  }

  /**
   * Handle data bundle selection
   */
  private async handleDataBundleSelection(req: HBussdReq, state: SessionState): Promise<string> {
    state.serviceType = ServiceType.DATA_BUNDLE;
    this.sessionManager.updateSession(req.SessionId, state);
    
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
    
    return this.responseBuilder.createNumberInputResponse(
      req.SessionId,
      "Select Network",
      "Select Network:\n1. MTN\n2. Telecel Ghana\n3. AT"
    );
  }

  /**
   * Handle airtime selection
   */
  private async handleAirtimeSelection(req: HBussdReq, state: SessionState): Promise<string> {
    state.serviceType = ServiceType.AIRTIME_TOPUP;
    this.sessionManager.updateSession(req.SessionId, state);
    
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
    
    return this.responseBuilder.createNumberInputResponse(
      req.SessionId,
      "Select Network",
      "Select Network:\n1. MTN\n2. Telecel Ghana\n3. AT"
    );
  }

  /**
   * Handle pay bills selection
   */
  private async handlePayBillsSelection(req: HBussdReq, state: SessionState): Promise<string> {
    state.serviceType = ServiceType.PAY_BILLS;
    this.sessionManager.updateSession(req.SessionId, state);
    
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
    
    return this.responseBuilder.createNumberInputResponse(
      req.SessionId,
      "Select TV Provider",
      "Select TV Provider:\n1. DSTV\n2. GoTV\n3. StarTimes TV"
    );
  }

  /**
   * Handle utility selection
   */
  private async handleUtilitySelection(req: HBussdReq, state: SessionState): Promise<string> {
    state.serviceType = ServiceType.UTILITY_SERVICE;
    this.sessionManager.updateSession(req.SessionId, state);
    
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
    
    return this.responseBuilder.createNumberInputResponse(
      req.SessionId,
      "Select Utility Service",
      "Select Utility Service:\n1. ECG Prepaid\n2. Ghana Water"
    );
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
    if (!["1", "2", "3"].includes(req.Message)) {
      return this.responseBuilder.createInvalidSelectionResponse(
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

    // This will be handled by the bundle service handler
    return "BUNDLE_SELECTION_REQUIRED";
  }

  /**
   * Handle airtime service selection
   */
  private handleAirtimeServiceSelection(req: HBussdReq, state: SessionState): string {
    if (!["1", "2", "3"].includes(req.Message)) {
      return this.responseBuilder.createInvalidSelectionResponse(
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

    return this.responseBuilder.createPhoneInputResponse(
      req.SessionId,
      "Enter Mobile Number",
      "Enter recipient mobile number:"
    );
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
      return this.responseBuilder.createResponse(
        req.SessionId,
        "Enter Meter Number",
        "Enter Ghana Water meter number:",
        "INPUT",
        "TEXT"
      );
    }
  }
}
