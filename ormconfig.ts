import { MongooseModuleOptions } from "@nestjs/mongoose";
import * as dotenv from 'dotenv';

dotenv.config();
const mongooseConfig: MongooseModuleOptions = {
  uri: process.env.MONGO_DB_URI || 'mongodb://127.0.0.1:27017/e-services', 
  // uri:  'mongodb://127.0.0.1:27017/e-tickets-ussd', 
};
 
export default mongooseConfig;
