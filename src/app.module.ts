import { Module } from "@nestjs/common";
import { AppService } from "./services/app.service";
import mongooseConfig from "ormconfig";
import { MongooseModule } from "@nestjs/mongoose";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { User, UserSchema } from "./models/schemas/user.shema";
import { JwtModule } from "@nestjs/jwt";
import { jwtConstants } from "./utils/validators";
import { PassportModule } from "@nestjs/passport";
import { Generics, GenericSchema } from "./models/schemas/generic.schema";
import { APP_GUARD } from "@nestjs/core";
import { AuthGuards } from "./configs/guards/jwt-auth.guard";
import { AuthService } from "./services/auth.service";
import { LocalStrategy } from "./configs/strategies/local.strategy";
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
import { PaymentController } from "./controllers/payment.controller";
import { CommissionService } from "./services/commission.service";
import { CommissionController } from "./controllers/commission.controller";
import { UserCommissionService } from "./services/user-commission.service";
import { CommissionTransactionLogService } from "./services/commission-transaction-log.service";
import { CommissionTransactionLog, CommissionTransactionLogSchema } from "./models/schemas/commission-transaction-log.schema";
import { SendMoneyController } from "./controllers/send-money.controller";
import { SendMoneyService } from "./services/send-money.service";

// Import USSD modular services
import { SessionManager } from "./services/ussd/session-manager";
import { ResponseBuilder } from "./services/ussd/response-builder";
import { UssdLoggingService } from "./services/ussd/logging.service";
import { PaymentProcessor } from "./services/ussd/payment-processor";
import { MenuHandler } from "./services/ussd/menu-handler";
import { ResultCheckerHandler } from "./services/handlers/result-checker.handler";
import { BundleHandler } from "./services/handlers/bundle.handler";
import { AirtimeHandler } from "./services/handlers/airtime.handler";
import { TVBillsHandler } from "./services/handlers/tv-bills.handler";
import { UtilityHandler } from "./services/handlers/utility.handler";
import { EarningHandler } from "./services/handlers/earning.handler";
import { OrderDetailsHandler } from "./services/handlers/order-details.handler";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HttpModule,
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
      { name: CommissionTransactionLog.name, schema: CommissionTransactionLogSchema },
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
    PaymentController,
    CommissionController,
    SendMoneyController,
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
    CommissionService,
    UserCommissionService,
    CommissionTransactionLogService,
    SendMoneyService,
    // USSD modular services
    SessionManager,
    ResponseBuilder,
    UssdLoggingService,
    PaymentProcessor,
    MenuHandler,
    ResultCheckerHandler,
    BundleHandler,
    AirtimeHandler,
    TVBillsHandler,
    UtilityHandler,
    EarningHandler,
    OrderDetailsHandler,
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
