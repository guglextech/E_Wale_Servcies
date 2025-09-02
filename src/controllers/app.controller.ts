import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { AppService } from "../services/app.service";
import { ApiTags } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";

@Controller('api/v1/app')
@ApiTags("App")
export class AppController {
  constructor(
    private readonly appService: AppService,
  ) { }
}
