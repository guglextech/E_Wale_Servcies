import {HttpException, HttpStatus, Injectable} from "@nestjs/common";
import {CustomPaginator, customResponse} from "../utils/responses";

@Injectable()
export class AppService {

  private excludedFields = ['__v'];

  constructor() {
  }

  // Basic service methods can be added here as needed
  async getHello(): Promise<string> {
    return 'Hello World!';
  }
}
