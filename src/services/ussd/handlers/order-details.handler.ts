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
    // Log order details view
    await this.logInteraction(req, state, 'order_details_viewed');

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
      return `Voucher Order Summary:\n\n` +
             `Service: ${service}\n` +
             `Quantity: ${quantity}\n` +
             `Mobile: ${mobile}\n` +
             `Total: GH₵${(price * quantity).toFixed(2)}\n\n` +
             `Press 1 to confirm payment`;
    } else {
      return `Voucher Order Summary:\n\n` +
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

    return `Bundle Order Summary:\n\n` +
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

    return `Airtime Order Summary:\n\n` +
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

    return `TV Bill Order Summary:\n\n` +
           `Provider: ${provider}\n` +
           `Account: ${accountNumber}\n` +
           `Customer: ${accountInfo?.Display || 'N/A'}\n` +
           `Amount: GH₵${amount?.toFixed(2)}\n\n` +
           `Press 1 to confirm payment`;
  }

  /**
   * Format utility order summary
   */
  private formatUtilityOrderSummary(state: SessionState): string {
    const provider = state.utilityProvider;
    const amount = state.amount;

    if (provider === UtilityProvider.ECG) {
      const meter = state.selectedMeter;
      return `ECG Top-Up Order Summary:\n\n` +
             `Provider: ${provider}\n` +
             `Meter: ${meter?.Display}\n` +
             `Customer: ${meter?.Value}\n` +
             `Amount: GH₵${amount?.toFixed(2)}\n\n` +
             `Press 1 to confirm payment`;
    } else {
      const meter = state.meterInfo?.[0];
      return `Ghana Water Top-Up Order Summary:\n\n` +
             `Provider: ${provider}\n` +
             `Meter: ${state.meterNumber}\n` +
             `Customer: ${meter?.Display || 'N/A'}\n` +
             `Amount: GH₵${amount?.toFixed(2)}\n\n` +
             `Press 1 to confirm payment`;
    }
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
