import {IsNotEmpty} from "class-validator";
import {ApiProperty} from "@nestjs/swagger";

export class VoteDto {
    @IsNotEmpty()
    @ApiProperty()
    totalVotes: number;
    @ApiProperty()
    @IsNotEmpty()
    accountNo: string;
    @IsNotEmpty()
    @ApiProperty()
    amount: string;
    @IsNotEmpty()
    @ApiProperty()
    channel: string;
}