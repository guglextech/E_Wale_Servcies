import { IsEmail, IsNotEmpty } from "class-validator";
import { ValidPassword } from "../../utils/validators";
import { Role } from "../schemas/enums/role.enum";
import { ApiProperty } from "@nestjs/swagger";

const passwordRegEx =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*d)(?=.*[@$!%*?&])[A-Za-zd@$!%*?&]{8,20}$/;
export class LoginUserDto {
  @IsEmail()
  @ApiProperty()
  username: string;
  @IsNotEmpty()
  @ValidPassword({message : "Password is not valid"})
  @ApiProperty()
  password: string;
}
