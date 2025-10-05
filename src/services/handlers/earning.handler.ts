import { Injectable } from "@nestjs/common";
import { HBussdReq } from "../../models/dto/hubtel/hb-ussd.dto";
import { SessionState } from "../ussd/types";
import { ResponseBuilder } from "../ussd/response-builder";
import { SessionManager } from "../ussd/session-manager";
import { CommissionTransactionLogService } from "../commission-transaction-log.service";

@Injectable()
export class EarningHandler {
  constructor(
    private readonly responseBuilder: ResponseBuilder,
    private readonly sessionManager: SessionManager,
    private readonly commissionTransactionLogService: CommissionTransactionLogService
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
      // Get user's earnings from commission transaction logs
      const earnings = await this.getUserEarnings(req.Mobile);
      
      const message = `You earned: GH ${earnings.totalEarnings.toFixed(2)}\nYou can withdraw at GH 10.00`;
      
      return this.responseBuilder.createReleaseResponse(
        req.SessionId,
        "My Earnings",
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
      const earnings = await this.getUserEarnings(req.Mobile);
      
      if (earnings.totalEarnings < 10) {
        const message = `Insufficient earnings. You need GH 10.00 minimum to withdraw.\nCurrent earnings: GH ${earnings.totalEarnings.toFixed(2)}`;
        return this.responseBuilder.createReleaseResponse(
          req.SessionId,
          "Withdrawal Failed",
          message
        );
      }

      // Set withdrawal flow state
      state.serviceType = 'earning';
      state.earningFlow = 'withdrawal';
      state.totalEarnings = earnings.totalEarnings;
      this.sessionManager.updateSession(req.SessionId, state);

      const message = `Send withdrawal request\nAvailable: GH ${earnings.totalEarnings.toFixed(2)}\nMinimum: GH 10.00\n\n1. Confirm withdrawal\n2. Cancel`;
      
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
    const message = `Terms & Conditions\n\nApplies to:\n- Data Bundle\n- Airtime\n- ECG Prepaid\n- Utility payments\n\nCommission rates vary by service type.`;
    
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
        await this.processWithdrawalRequest(req.Mobile, state.totalEarnings);
        
        const message = `Withdrawal request submitted successfully!\nAmount: GH ${state.totalEarnings.toFixed(2)}\nYou will receive payment within 24 hours.`;
        
        return this.responseBuilder.createReleaseResponse(
          req.SessionId,
          "Withdrawal Confirmed",
          message
        );
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

  /**
   * Get user's total earnings from commission transaction logs
   */
  private async getUserEarnings(mobileNumber: string): Promise<{ totalEarnings: number; transactionCount: number }> {
    try {
      // Get all successful commission transactions for the user
      const logs = await this.commissionTransactionLogService.getCommissionLogsByMobile(mobileNumber, 1000);
      
      // Calculate total earnings from successful transactions
      const successfulLogs = logs.filter(log => 
        log.status === 'Paid' && 
        log.commissionServiceStatus === 'delivered' &&
        log.isFulfilled === true
      );

      const totalEarnings = successfulLogs.reduce((sum, log) => {
        // Calculate commission based on transaction amount
        // Assuming 2% commission rate for all services
        const commission = log.amount * 0.02;
        return sum + commission;
      }, 0);

      return {
        totalEarnings: Math.max(0, totalEarnings), // Ensure non-negative
        transactionCount: successfulLogs.length
      };
    } catch (error) {
      console.error('Error calculating user earnings:', error);
      return { totalEarnings: 0, transactionCount: 0 };
    }
  }

  /**
   * Process withdrawal request
   */
  private async processWithdrawalRequest(mobileNumber: string, amount: number): Promise<void> {
    try {
      // Here you would typically:
      // 1. Create a withdrawal record in database
      // 2. Send notification to admin
      // 3. Process payment through payment gateway
      // 4. Update user's earnings balance
      
      console.log(`Processing withdrawal request for ${mobileNumber}: GH ${amount.toFixed(2)}`);
      
      // For now, just log the withdrawal request
      // In a real implementation, you would save this to a withdrawals table
      // and trigger the actual payment processing
      
    } catch (error) {
      console.error('Error processing withdrawal request:', error);
      throw error;
    }
  }
}
