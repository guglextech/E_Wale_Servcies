import {HttpException, HttpStatus, Injectable} from "@nestjs/common";
import {JwtService} from "@nestjs/jwt";
import {UsersService} from "./users.service";
import * as bcrypt from "bcrypt";
import {InjectModel} from "@nestjs/mongoose";
import {Model} from "mongoose";
import {User} from "../models/schemas/user.shema";
import {genrUuid, jwtConstants} from "../utils/validators";
import { Ticket } from "src/models/schemas/ticket.schema";

@Injectable()
export class TicketService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    // @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Ticket.name) private readonly ticketModel: Model<Ticket>,
  ) {}

async getAllPaidTickets(): Promise<{ count: number; tickets: Ticket[] }> {
    const tickets = await this.ticketModel.find({
      paymentStatus: 'Paid',
      isSuccessful: true,
    }).exec();
  
    return {
      count: tickets.length,
      tickets,
    };
  }
  


  async searchTicket(query: string): Promise<Ticket[]> {
    return await this.ticketModel.find({
      paymentStatus: 'Paid',
      isSuccessful: true,
      $or: [
        { mobile: query },
        { ticketCode: query }
      ]
    }).exec();
  }
  

}