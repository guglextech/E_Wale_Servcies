import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { TicketService } from "src/services/tickets.service";

@Controller("api/v1/tickets")
@ApiTags("App")
export class TicketController {
  constructor(private readonly ticketSvc: TicketService) {}


  /**
   * 
   * @returns 
   */
  @Get("paid")
  async getPaidTickets() {
    return await this.ticketSvc.getAllPaidTickets();
  }


  /**
   * 
   * @param query 
   * @returns 
   */
  @Get("search")
  async searchTickets(@Query("q") query: string) {
    if (!query) {
      throw new BadRequestException("Search query is required");
    }
    return await this.ticketSvc.searchTicket(query);
  }
}
