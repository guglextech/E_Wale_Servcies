import {Body, Controller, Get, Post, Req, Request, UseGuards} from "@nestjs/common";
import {CreateUserDto} from "../models/dto/create-user.dto";
import {AuthService} from "../services/auth.service";
import {Public, Roles} from "../utils/validators";
import {GoogleAuthGuard, LoginAuthGuard} from "../configs/guards/local-auth.guards";
import {Role} from "../models/schemas/enums/role.enum";
import {ApiProperty, ApiTags} from "@nestjs/swagger";
import {LoginUserDto} from "../models/dto/login-user.dto";
import {RoleAuthGuard} from "../configs/guards/role-auth.guard";

@Controller('api/v1/auth')
@ApiTags("Auths")
export class AuthController {

  constructor(private readonly authService: AuthService) {}

  @Post("admin/signup")
  createUsers(@Body() createUserDto: CreateUserDto)  {
    return this.authService.createAdminUser(createUserDto);
  }

  @Public()
  @UseGuards(LoginAuthGuard)
  @ApiProperty({ type: () => LoginUserDto })
  @Post("login")
  login(@Request() req,@Body() loginUserDto: LoginUserDto) {
    return req.user;
  }

}
