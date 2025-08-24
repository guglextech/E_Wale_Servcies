import { IsEmail, IsNotEmpty } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
export class PermissionDto {
  @IsEmail()
  @ApiProperty()
  username: string;
  @ApiProperty()
  userDescription: string;
  @IsNotEmpty()
  @ApiProperty()
  permissions: [];
}