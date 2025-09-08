import { Controller, Get, Query, Param, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiQuery, ApiParam, ApiResponse } from "@nestjs/swagger";
import { CommissionTransactionLogService } from "../services/commission-transaction-log.service";
import { TransactionStatusCheckService } from "../services/transaction-status-check.service";
import { AuthGuards } from "../configs/guards/jwt-auth.guard";

@ApiTags('Commission Transaction Logs')
@Controller('commission-logs')
@UseGuards(AuthGuards)
export class CommissionTransactionLogsController {
  constructor(
    private readonly commissionLogService: CommissionTransactionLogService,
    private readonly transactionStatusCheckService: TransactionStatusCheckService
  ) {}

  @Get('mobile/:mobileNumber')
  @ApiOperation({ summary: 'Get commission transaction logs by mobile number' })
  @ApiParam({ name: 'mobileNumber', description: 'Mobile number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of logs to return (default: 50)' })
  @ApiResponse({ status: 200, description: 'Commission transaction logs retrieved successfully' })
  async getLogsByMobile(
    @Param('mobileNumber') mobileNumber: string,
    @Query('limit') limit: number = 50
  ) {
    const logs = await this.commissionLogService.getCommissionLogsByMobile(mobileNumber, limit);
    return {
      success: true,
      data: logs
    };
  }

  @Get('session/:sessionId')
  @ApiOperation({ summary: 'Get commission transaction logs by session ID' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Commission transaction logs retrieved successfully' })
  async getLogsBySession(@Param('sessionId') sessionId: string) {
    const logs = await this.commissionLogService.getCommissionLogsBySession(sessionId);
    return {
      success: true,
      data: logs
    };
  }

  @Get('client-reference/:clientReference')
  @ApiOperation({ summary: 'Get commission transaction log by client reference' })
  @ApiParam({ name: 'clientReference', description: 'Client reference' })
  @ApiResponse({ status: 200, description: 'Commission transaction log retrieved successfully' })
  async getLogByClientReference(@Param('clientReference') clientReference: string) {
    const log = await this.commissionLogService.getCommissionLogByClientReference(clientReference);
    return {
      success: true,
      data: log
    };
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get commission transaction statistics' })
  @ApiResponse({ status: 200, description: 'Commission transaction statistics retrieved successfully' })
  async getStatistics() {
    const stats = await this.commissionLogService.getCommissionTransactionStats();
    return {
      success: true,
      data: stats
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all commission transaction logs with pagination' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of logs per page (default: 50)' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (Paid, Unpaid, Pending)' })
  @ApiQuery({ name: 'commissionServiceStatus', required: false, description: 'Filter by commission service status (delivered, failed, pending)' })
  @ApiQuery({ name: 'serviceType', required: false, description: 'Filter by service type (bundle, airtime, tv_bill, utility)' })
  @ApiResponse({ status: 200, description: 'Commission transaction logs retrieved successfully' })
  async getAllLogs(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('status') status?: string,
    @Query('commissionServiceStatus') commissionServiceStatus?: string,
    @Query('serviceType') serviceType?: string
  ) {
    const result = await this.commissionLogService.getAllCommissionLogs(
      page, 
      limit, 
      status, 
      commissionServiceStatus, 
      serviceType
    );
    return {
      success: true,
      ...result
    };
  }

  @Get('status-check/:clientReference')
  @ApiOperation({ summary: 'Check transaction status by client reference' })
  @ApiParam({ name: 'clientReference', description: 'Client reference' })
  @ApiResponse({ status: 200, description: 'Transaction status checked successfully' })
  async checkTransactionStatus(@Param('clientReference') clientReference: string) {
    const status = await this.transactionStatusCheckService.checkTransactionStatusByClientReference(clientReference);
    return {
      success: true,
      data: status
    };
  }

  @Get('status-check/hubtel/:hubtelTransactionId')
  @ApiOperation({ summary: 'Check transaction status by Hubtel transaction ID' })
  @ApiParam({ name: 'hubtelTransactionId', description: 'Hubtel transaction ID' })
  @ApiResponse({ status: 200, description: 'Transaction status checked successfully' })
  async checkTransactionStatusByHubtelId(@Param('hubtelTransactionId') hubtelTransactionId: string) {
    const status = await this.transactionStatusCheckService.checkTransactionStatusByHubtelId(hubtelTransactionId);
    return {
      success: true,
      data: status
    };
  }

  @Get('status-check/network/:networkTransactionId')
  @ApiOperation({ summary: 'Check transaction status by network transaction ID' })
  @ApiParam({ name: 'networkTransactionId', description: 'Network transaction ID' })
  @ApiResponse({ status: 200, description: 'Transaction status checked successfully' })
  async checkTransactionStatusByNetworkId(@Param('networkTransactionId') networkTransactionId: string) {
    const status = await this.transactionStatusCheckService.checkTransactionStatusByNetworkId(networkTransactionId);
    return {
      success: true,
      data: status
    };
  }

  @Get('retryable-failed')
  @ApiOperation({ summary: 'Get retryable failed transactions' })
  @ApiResponse({ status: 200, description: 'Retryable failed transactions retrieved successfully' })
  async getRetryableFailedTransactions() {
    const logs = await this.commissionLogService.getRetryableFailedTransactions();
    return {
      success: true,
      data: logs
    };
  }
}
