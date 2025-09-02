import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from "@nestjs/swagger";
import { UssdService } from "../services/ussd.service";
import { AuthGuards } from "../configs/guards/jwt-auth.guard";

@Controller('api/v1/ussd-logs')
@ApiTags("USSD Logs")
@UseGuards(AuthGuards)
export class UssdLogsController {
    constructor(private readonly ussdService: UssdService) {}

    @Get('mobile/:mobileNumber')
    @ApiOperation({ summary: 'Get USSD logs by mobile number' })
    @ApiParam({ name: 'mobileNumber', description: 'Mobile number to search for' })
    @ApiQuery({ name: 'limit', required: false, description: 'Number of logs to return (default: 50)' })
    async getLogsByMobile(
        @Param('mobileNumber') mobileNumber: string,
        @Query('limit') limit: number = 50
    ) {
        const logs = await this.ussdService.getUssdLogsByMobile(mobileNumber, limit);
        return {
            success: true,
            data: logs,
            count: logs.length,
            mobileNumber
        };
    }

    @Get('session/:sessionId')
    @ApiOperation({ summary: 'Get USSD logs by session ID' })
    @ApiParam({ name: 'sessionId', description: 'Session ID to search for' })
    async getLogsBySession(@Param('sessionId') sessionId: string) {
        const logs = await this.ussdService.getUssdLogsBySession(sessionId);
        return {
            success: true,
            data: logs,
            count: logs.length,
            sessionId
        };
    }

    @Get('statistics')
    @ApiOperation({ summary: 'Get USSD usage statistics' })
    async getStatistics() {
        const stats = await this.ussdService.getUssdStatistics();
        return {
            success: true,
            data: stats
        };
    }

    @Get()
    @ApiOperation({ summary: 'Get all USSD logs with pagination' })
    @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
    @ApiQuery({ name: 'limit', required: false, description: 'Number of logs per page (default: 50)' })
    @ApiQuery({ name: 'status', required: false, description: 'Filter by status (initiated, completed, failed, cancelled)' })
    async getAllLogs(
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 50,
        @Query('status') status?: string
    ) {
        const result = await this.ussdService.getAllUssdLogs(page, limit, status);
        return {
            success: true,
            ...result
        };
    }
}
