import { IsEmail, IsNotEmpty } from "class-validator";
import { ValidPassword } from "../../utils/validators";
import { Role } from "../schemas/enums/role.enum";
import { ApiProperty } from "@nestjs/swagger";

const passwordRegEx =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*d)(?=.*[@$!%*?&])[A-Za-zd@$!%*?&]{8,20}$/;
export class CreateUserDto {
  id: number;
  @IsEmail()
  @ApiProperty()
  username: string;
  @IsNotEmpty()
  @ValidPassword({message : "Password is not valid"})
  @ApiProperty()
  password: string;
  @ApiProperty()
  @IsNotEmpty()
  role: Role;
  @ApiProperty()
  firstname: string;
  @ApiProperty()
  permissions: [];
  @ApiProperty()
  lastname: string;
  @ApiProperty()
  photo: string;
  @ApiProperty()
  phone: string;
  @ApiProperty()
  userDescription: string;
  @ApiProperty()
  authType: string;
}

export class CreateUser2Dto {
  id: number;
  @IsEmail()
  @ApiProperty()
  username: string;
  @IsNotEmpty()
  @ValidPassword({message : "Password is not valid"})
  @ApiProperty()
  password: string;
  role: Role;
  @ApiProperty()
  firstname: string;
  @ApiProperty()
  lastname: string;
}
