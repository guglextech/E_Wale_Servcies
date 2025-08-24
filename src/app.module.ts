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
import { AwsService } from "./utils/aws.service";
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
import { Ticket, TicketSchema } from "./models/schemas/ticket.schema";
import { Transactions, TransactionsSchema } from "./models/schemas/transaction.schema";
import { Voucher, VoucherSchema } from "./models/schemas/voucher.schema";
import { TicketController } from "./controllers/tickets.controller";
import { TicketService } from "./services/tickets.service";
import { VouchersController } from "./controllers/vouchers.controller";
import { VouchersService } from "./services/vouchers.service";

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
      { name: Ticket.name, schema: TicketSchema },
      { name: Transactions.name, schema: TransactionsSchema },
      { name: Voucher.name, schema: VoucherSchema },
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
    TicketController,
    VouchersController,
  ],
  providers: [
    AppService,
    UssdService,
    AwsService,
    MailService,
    TicketService,
    VouchersService,
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
