import { Module } from "@nestjs/common";
import { AppService } from "./services/app.service";
import mongooseConfig from "ormconfig";
import { MongooseModule } from "@nestjs/mongoose";
import { ConfigModule } from "@nestjs/config";
import { User, UserSchema } from "./models/schemas/user.shema";
import { JwtModule } from "@nestjs/jwt";
import { jwtConstants } from "./utils/validators";
import { PassportModule } from "@nestjs/passport";
import { Generics, GenericSchema } from "./models/schemas/generic.schema";
import { APP_GUARD } from "@nestjs/core";
import { AuthGuards } from "./configs/guards/jwt-auth.guard";
import { AuthService } from "./services/auth.service";
import { LocalStrategy } from "./configs/strategies/local.strategy";
import { GoogleStrategy } from "./configs/strategies/google.strategy";
import { UsersService } from "./services/users.service";
import { UsersController } from "./controllers/users.controller";
import { AppController } from "./controllers/app.controller";
import { AuthController } from "./controllers/auth.controller";
import { MailService } from "./services/mail.service";
import { UssdController } from "./controllers/ussd.controller";
import { UssdService } from "./services/ussd.service";
import {
  HbPayments,
  HbPaymentsSchema,
} from "./models/dto/hubtel/callback-ussd.schema";
import { Transactions, TransactionsSchema } from "./models/schemas/transaction.schema";
import { Voucher, VoucherSchema } from "./models/schemas/voucher.schema";
import { VouchersController } from "./controllers/vouchers.controller";
import { VouchersService } from "./services/vouchers.service";
import { AirtimeController } from "./controllers/airtime.controller";
import { AirtimeService } from "./services/airtime.service";
import { BundleController } from "./controllers/bundle.controller";
import { BundleService } from "./services/bundle.service";
import { TVBillsController } from "./controllers/tv-bills.controller";
import { TVBillsService } from "./services/tv-bills.service";
import { UtilityController } from "./controllers/utility.controller";
import { UtilityService } from "./services/utility.service";
import { TransactionStatusController } from "./controllers/transaction-status.controller";
import { TransactionStatusService } from "./services/transaction-status.service";
import { UssdLog, UssdLogSchema } from "./models/schemas/ussd-log.schema";
import { UssdLogsController } from "./controllers/ussd-logs.controller";
import { PaymentController } from "./controllers/payment.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(mongooseConfig.uri, {
      connectionFactory: (connection) => {
        connection.on('connected', () => {
          console.log('MongoDB is connected');
        });
        connection.on('error', (error) => {
          console.log('MongoDB connection error:', error);
        });
        return connection;
      },
    }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Generics.name, schema: GenericSchema },
      { name: HbPayments.name, schema: HbPaymentsSchema },
      { name: Transactions.name, schema: TransactionsSchema },
      { name: Voucher.name, schema: VoucherSchema },
      { name: UssdLog.name, schema: UssdLogSchema },
    ]),
    JwtModule.register({
      secret: jwtConstants.secret,
      signOptions: { expiresIn: jwtConstants.expireDate },
    }),
    PassportModule,
  ],
  controllers: [
    UsersController,
    AuthController,
    UssdController,
    AppController,
    VouchersController,
    AirtimeController,
    BundleController,
    TVBillsController,
    UtilityController,
    TransactionStatusController,
    UssdLogsController,
    PaymentController,
  ],
  providers: [
    AppService,
    UssdService,
    MailService,
    VouchersService,
    AirtimeService,
    BundleService,
    TVBillsService,
    UtilityService,
    TransactionStatusService,
    // {
    //   provide: APP_GUARD,
    //   useClass: AuthGuards,
    // },
    AuthService,
    LocalStrategy,
    // GoogleStrategy,
    UsersService,
  ],
})
export class AppModule { }
