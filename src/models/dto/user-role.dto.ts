import { IsEmail, IsNotEmpty } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Role } from "../schemas/enums/role.enum";

export class UserRoleDto {
  @IsEmail()
  @ApiProperty()
  username: string;
  @IsNotEmpty()
  @ApiProperty()
  role: Role;
}