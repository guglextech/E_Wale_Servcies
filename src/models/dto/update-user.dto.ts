import { IsEmail, IsNotEmpty } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Role } from "../schemas/enums/role.enum";
import {ValidPassword} from "../../utils/validators";

export class UpdateUserDto {
  id: number;
  @IsEmail()
  @ApiProperty()
  username: string;
  @ApiProperty()
  @IsNotEmpty()
  role: Role;
  @ApiProperty()
  firstname: string;
  @ApiProperty()
  lastname: string;
  @ApiProperty()
  photo: string;
  @ApiProperty()
  phone: string;
}

export class UpdateUserPasswordDto {
  @IsNotEmpty()
  @ValidPassword({message : "Password is not valid"})
  @ApiProperty()
  oldPassword: string;
  @IsNotEmpty()
  @ValidPassword({message : "New Password is not valid"})
  @ApiProperty()
  newPassword: string;
}
