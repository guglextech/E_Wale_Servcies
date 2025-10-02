import { Injectable } from '@nestjs/common';
import { HBussdReq } from '../../../models/dto/hubtel/hb-ussd.dto';
import { SessionState } from '../types';
import { ResponseBuilder } from '../response-builder';
import { SessionManager } from '../session-manager';
import { UssdLoggingService } from '../logging.service';
import { UtilityProvider } from '../../../models/dto/utility.dto';

@Injectable()
export class OrderDetailsHandler {
  constructor(
    private readonly responseBuilder: ResponseBuilder,
    private readonly sessionManager: SessionManager,
    private readonly loggingService: UssdLoggingService,
  ) {}

  /**
   * Handle order details display for all services
   */
  async handleOrderDetails(req: HBussdReq, state: SessionState): Promise<string> {
    // Log current session state
    await this.loggingService.logSessionState(req.SessionId, req.Mobile, state, 'active');
    return this.responseBuilder.createDisplayResponse(
      req.SessionId,
      "Order Summary",
      this.formatOrderSummary(state)
    );
  }

  /**
   * Format order summary based on service type
   */
  private formatOrderSummary(state: SessionState): string {
    switch (state.serviceType) {
      case 'result_checker':
        return this.formatVoucherOrderSummary(state);
      case 'data_bundle':
        return this.formatBundleOrderSummary(state);
      case 'airtime_topup':
        return this.formatAirtimeOrderSummary(state);
      case 'pay_bills':
        return this.formatTVOrderSummary(state);
      case 'utility_service':
        return this.formatUtilityOrderSummary(state);
      default:
        return "Invalid service type";
    }
  }

  /**
   * Format voucher order summary
   */
  private formatVoucherOrderSummary(state: SessionState): string {
    const service = state.service;
    const quantity = state.quantity;
    const flow = state.flow;
    const mobile = state.mobile;
    const name = state.name;
    const price = this.getServicePrice(service);

    if (flow === 'self') {
      return `Voucher Details:\n\n` +
             `Service: ${service}\n` +
             `Quantity: ${quantity}\n` +
             `Mobile: ${mobile}\n` +
             `Total: GH₵${(price * quantity).toFixed(2)}\n\n` +
             `Press 1 to confirm payment`;
    } else {
      return `Voucher Details:\n\n` +
             `Service: ${service}\n` +
             `Quantity: ${quantity}\n` +
             `For: ${name} (${mobile})\n` +
             `Total: GH₵${(price * quantity).toFixed(2)}\n\n` +
             `Press 1 to confirm payment`;
    }
  }

  /**
   * Format bundle order summary
   */
  private formatBundleOrderSummary(state: SessionState): string {
    const bundle = state.selectedBundle;
    const mobile = state.mobile;
    const network = state.network;

    return `Bundle Order:\n\n` +
           `Network: ${network}\n` +
           `Bundle: ${bundle?.Display}\n` +
           `Mobile: ${mobile}\n` +
           `Amount: GH₵${bundle?.Amount}\n\n` +
           `Press 1 to confirm payment`;
  }

  /**
   * Format airtime order summary
   */
  private formatAirtimeOrderSummary(state: SessionState): string {
    const mobile = state.mobile;
    const network = state.network;
    const amount = state.amount;

    return `Airtime :\n\n` +
           `Network: ${network}\n` +
           `Mobile: ${mobile}\n` +
           `Amount: GH₵${amount?.toFixed(2)}\n\n` +
           `Press 1 to confirm payment`;
  }

  /**
   * Format TV order summary
   */
  private formatTVOrderSummary(state: SessionState): string {
    const provider = state.tvProvider;
    const accountNumber = state.accountNumber;
    const amount = state.amount;
    const accountInfo = state.accountInfo?.[0];
    const nameData = accountInfo?.Data?.find(item => item.Display === 'name');

    return `Bill Payment:\n\n` +
           `Provider: ${provider}\n` +
           `Account: ${accountNumber}\n` +
           `Customer: ${nameData?.Value || 'N/A'}\n` +
           `Amount: GH₵${amount?.toFixed(2)}\n\n` +
           `1. Confirm\n2. Cancel`;
  }

  /**
   * Format utility order summary
   */
  private formatUtilityOrderSummary(state: SessionState): string {
    const provider = state.utilityProvider;
    const amount = state.amount;

    if (provider === UtilityProvider.ECG) {
      const meter = state.selectedMeter;
      const meterTypeDisplay = state.meterType === 'prepaid' ? 'Prepaid' : 'Postpaid';
      return `ECG ${meterTypeDisplay} Top-Up:\n\n` +
             `Provider: ${provider}\n` +
             `Meter Type: ${meterTypeDisplay}\n` +
             `Meter: ${meter?.Display}\n` +
             `Amount: GH₵${amount?.toFixed(2)}\n\n` +
             `Press 1 to confirm payment`;
    } else {
      return `Ghana Water Bill:\n\n` +
             `Provider: ${provider}\n` +
             `Meter: ${state.meterNumber}\n` +
             `Amount: GH₵${amount?.toFixed(2)}\n\n` +
             `Press 1 to confirm payment`;
    }
  }

  /**
   * Get service price for vouchers
   */
  private getServicePrice(service: string): number {
    const priceMap = {
      "BECE Checker Voucher": 20,
      "NovDec Checker": 21,
      "School Placement Checker": 21
    };

    return priceMap[service] || 21;
  }
}
