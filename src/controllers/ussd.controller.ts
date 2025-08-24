import {Body, Controller, Post} from "@nestjs/common";
import {ApiTags} from "@nestjs/swagger";
import {HBUssdCallBackReq} from "src/models/dto/hubtel/callback-ussd.dto";
import {HBussdReq} from "src/models/dto/hubtel/hb-ussd.dto";
import {UssdService} from "src/services/ussd.service";
import {Public} from "src/utils/validators";
import {HbPayments} from "../models/dto/hubtel/callback-ussd.schema";

@Controller('api/v1/flow')
@ApiTags("App")
export class UssdController {
    constructor(private readonly ussdService: UssdService) {}

    @Public()
    @Post('ussd')
    async ussd(@Body() req: HBussdReq) {
        return await this.ussdService.handleUssdRequest(req);
    }


    @Public()
    @Post('ussd/callback')
    async completionUssdCallback(@Body() req: HbPayments) {
        // console.log(req, "CONTROLLER LEVEL");
        return await this.ussdService.handleUssdCallback(req); 
    }
}

