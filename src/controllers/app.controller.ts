import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { AppService } from "../services/app.service";
import { ApiTags } from "@nestjs/swagger";
import { AwsService } from "../utils/aws.service";
import { FileInterceptor } from "@nestjs/platform-express";

@Controller('api/v1/app')
@ApiTags("App")
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly awsService: AwsService
  ) { }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    return this.awsService.callAwsS3(file);
  }
}
