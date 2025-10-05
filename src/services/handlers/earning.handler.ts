import { Injectable } from "@nestjs/common";
import { HBussdReq } from "../../models/dto/hubtel/hb-ussd.dto";
import { SessionState } from "../ussd/types";
import { ResponseBuilder } from "../ussd/response-builder";
import { SessionManager } from "../ussd/session-manager";
import { UserCommissionService } from "../user-commission.service";

@Injectable()
export class EarningHandler {
  constructor(
    private readonly responseBuilder: ResponseBuilder,
    private readonly sessionManager: SessionManager,
    private readonly userCommissionService: UserCommissionService
  ) {}

  /**
   * Handle earning menu selection
   */
  async handleEarningMenuSelection(req: HBussdReq, state: SessionState): Promise<string> {
    const menuHandlers = {
      "1": () => this.handleMyEarnings(req, state),
      "2": () => this.handleWithdrawMoney(req, state),
      "3": () => this.handleTermsAndConditions(req, state)
    };

    const handler = menuHandlers[req.Message];
    if (handler) {
      return await handler();
    }

    return this.responseBuilder.createInvalidSelectionResponse(
      req.SessionId,
      "Please select a valid option (1-3)"
    );
  }

  /**
   * Handle My Earnings - show user's earnings
   */
  private async handleMyEarnings(req: HBussdReq, state: SessionState): Promise<string> {
    try {
      // Get user's earnings from user commission service
      const earnings = await this.userCommissionService.getUserEarnings(req.Mobile);
      
      const message = `My Balance\n\nTotal Earnings: GH ${earnings.totalEarnings.toFixed(2)}\nAvailable Balance: GH ${earnings.availableBalance.toFixed(2)}\nTotal Withdrawn: GH ${earnings.totalWithdrawn.toFixed(2)}\nPending Withdrawals: GH ${earnings.pendingWithdrawals.toFixed(2)}\n\nMinimum withdrawal: GH 10.00`;
      
      return this.responseBuilder.createReleaseResponse(
        req.SessionId,
        "My Balance",
        message
      );
    } catch (error) {
      console.error('Error fetching user earnings:', error);
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Unable to fetch earnings. Please try again."
      );
    }
  }

  /**
   * Handle Withdraw Money - initiate withdrawal request
   */
  private async handleWithdrawMoney(req: HBussdReq, state: SessionState): Promise<string> {
    try {
      // Get user's earnings
      const earnings = await this.userCommissionService.getUserEarnings(req.Mobile);
      
      if (earnings.availableBalance < 10) {
        const message = `Insufficient balance. You need GH 10.00 minimum to withdraw.\nAvailable Balance: GH ${earnings.availableBalance.toFixed(2)}`;
        return this.responseBuilder.createReleaseResponse(
          req.SessionId,
          "Withdrawal Failed",
          message
        );
      }

      // Set withdrawal flow state
      state.serviceType = 'earning';
      state.earningFlow = 'withdrawal';
      state.totalEarnings = earnings.availableBalance;
      this.sessionManager.updateSession(req.SessionId, state);

      const message = `Withdraw Money\n\nAvailable Balance: GH ${earnings.availableBalance.toFixed(2)}\nMinimum Withdrawal: GH 10.00\n\n1. Confirm withdrawal\n2. Cancel`;
      
      return this.responseBuilder.createNumberInputResponse(
        req.SessionId,
        "Withdrawal Request",
        message
      );
    } catch (error) {
      console.error('Error processing withdrawal request:', error);
      return this.responseBuilder.createErrorResponse(
        req.SessionId,
        "Unable to process withdrawal. Please try again."
      );
    }
  }

  /**
   * Handle Terms and Conditions
   */
  private handleTermsAndConditions(req: HBussdReq, state: SessionState): string {
    const message = `Terms & Conditions applies to:\nData Bundle\nAirtime\nECG Prepaid\nUtility payments\nCommission rates vary by service type.`;
    
    return this.responseBuilder.createReleaseResponse(
      req.SessionId,
      "Terms & Conditions",
      message
    );
  }

  /**
   * Handle withdrawal confirmation
   */
  async handleWithdrawalConfirmation(req: HBussdReq, state: SessionState): Promise<string> {
    if (req.Message === "1") {
      // User confirmed withdrawal
      try {
        // Process withdrawal request
        const result = await this.userCommissionService.processWithdrawalRequest(
          req.Mobile, 
          state.totalEarnings
        );
        
        if (result.success) {
          const message = `Withdrawal request submitted successfully!\nAmount: GH ${state.totalEarnings.toFixed(2)}\nNew Balance: GH ${result.newBalance.toFixed(2)}\nYou will receive payment within 24 hours.`;
        return this.responseBuilder.createReleaseResponse(
          req.SessionId,
          "Withdrawal Confirmed",
          message
        );
        } else {
          return this.responseBuilder.createErrorResponse(
            req.SessionId,
            result.message
          );
        }
      } catch (error) {
        console.error('Error processing withdrawal:', error);
        return this.responseBuilder.createErrorResponse(
          req.SessionId,
          "Withdrawal request failed. Please try again."
        );
      }
    } else if (req.Message === "2") {
      // User cancelled
      return this.responseBuilder.createReleaseResponse(
        req.SessionId,
        "Cancelled",
        "Withdrawal request cancelled."
      );
    } else {
      return this.responseBuilder.createInvalidSelectionResponse(
        req.SessionId,
        "Please select 1 to confirm or 2 to cancel"
      );
    }
  }
}
