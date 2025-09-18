import { Injectable } from "@nestjs/common";
import { HbEnums } from "../../models/dto/hubtel/hb-enums";
import { CheckOutItem } from "../../models/dto/hubtel/hb-ussd.dto";
import { SessionState, CommissionServiceRequest } from "./types";
import { NetworkProvider } from "../../models/dto/airtime.dto";
import { TVProvider } from "../../models/dto/tv-bills.dto";
import { UtilityProvider } from "../../models/dto/utility.dto";

@Injectable()
export class PaymentProcessor {
  /**
   * Create payment request response
   */
  createPaymentRequest(
    sessionId: string,
    total: number,
    serviceName: string
  ): string {
    const response: any = {
      SessionId: sessionId,
      Type: HbEnums.ADDTOCART,
      Message: `Kindly approve the Momo prompt for GHS ${total}. If no prompt, Dial *170# select 6) My Wallet 3) My Approvals. Instant delivery.`,
      Item: new CheckOutItem(serviceName, 1, total),
      Label: "Payment Request Submitted",
      DataType: HbEnums.DATATYPE_DISPLAY,
      FieldType: HbEnums.FIELDTYPE_TEXT
    };
    console.log(response);
    return JSON.stringify(response);
  }

  /**
   * Build commission service request based on session state
   */
  buildCommissionServiceRequest(
    sessionState: SessionState,
    sessionId: string,
    callbackUrl: string
  ): CommissionServiceRequest | null {
    const baseRequest = {
      clientReference: sessionId,
      amount: sessionState.totalAmount,
      callbackUrl
    };

    switch (sessionState.serviceType) {
      case "data_bundle":
        return {
          ...baseRequest,
          serviceType: 'bundle' as const,
          network: sessionState.network,
          destination: sessionState.mobile,
          extraData: {
            bundleType: 'data',
            bundleValue: sessionState.bundleValue
          }
        };

      case "airtime_topup":
        return {
          ...baseRequest,
          serviceType: 'airtime' as const,
          network: sessionState.network,
          destination: sessionState.mobile,
          extraData: {}
        };

      case "pay_bills":
        return {
          ...baseRequest,
          serviceType: 'tv_bill' as const,
          tvProvider: sessionState.tvProvider,
          destination: sessionState.accountNumber,
          extraData: {
            accountNumber: sessionState.accountNumber
          }
        };

      case "utility_service":
        if (sessionState.utilityProvider === UtilityProvider.ECG) {
          return {
            ...baseRequest,
            serviceType: 'utility' as const,
            utilityProvider: sessionState.utilityProvider,
            destination: sessionState.mobile,
            extraData: {
              meterNumber: sessionState.selectedMeter?.Value || sessionState.meterNumber
            }
          };
        } else if (sessionState.utilityProvider === UtilityProvider.GHANA_WATER) {
          return {
            ...baseRequest,
            serviceType: 'utility' as const,
            utilityProvider: sessionState.utilityProvider,
            destination: sessionState.meterNumber,
            extraData: {
              meterNumber: sessionState.meterNumber,
              email: sessionState.email || 'customer@example.com', // Default email if not provided
              sessionId: sessionState.sessionId || sessionId // Use sessionId from query or fallback to USSD sessionId
            }
          };
        }
        return null;

      default:
        return null;
    }
  }

  /**
   * Get service name for payment
   */
  getServiceName(sessionState: SessionState): string {
    if (sessionState.service) {
      return sessionState.service;
    }
    
    if (sessionState.selectedBundle?.Display) {
      return sessionState.selectedBundle.Display;
    }
    
    if (sessionState.tvProvider) {
      return sessionState.tvProvider;
    }
    
    if (sessionState.utilityProvider) {
      return `${sessionState.utilityProvider} Top-Up`;
    }
    
    return "Airtime Top-Up";
  }

  /**
   * Validate payment amount
   */
  validateAmount(amount: number, min: number = 0.01, max: number = 100): boolean {
    return !isNaN(amount) && amount >= min && amount <= max;
  }

  /**
   * Validate amount decimal places
   */
  validateAmountFormat(amount: number, maxDecimalPlaces: number = 2): boolean {
    const decimalPlaces = (amount.toString().split('.')[1] || '').length;
    return decimalPlaces <= maxDecimalPlaces;
  }

  /**
   * Format amount for display
   */
  formatAmount(amount: number): string {
    return `GHS ${amount.toFixed(2)}`;
  }
}
