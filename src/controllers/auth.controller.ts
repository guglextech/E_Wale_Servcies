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

  // @Public()
  // @Post("signup")
  // createUser(@Body() createUserDto: CreateUserDto)  {
  //   createUserDto.role = Role.User;
  //   return this.authService.createUser(createUserDto);
  // }

  @Roles(Role.Admin)
  @UseGuards(RoleAuthGuard)
  @Post("admin/signup")
  createUsers(@Body() createUserDto: CreateUserDto)  {
    return this.authService.createUser(createUserDto);
  }

  @Public()
  @UseGuards(LoginAuthGuard)
  @ApiProperty({ type: () => LoginUserDto })
  @Post("login")
  login(@Request() req,@Body() loginUserDto: LoginUserDto) {
    return req.user;
  }

  // @Public()
  // @UseGuards(GoogleAuthGuard)
  // @Get('google')
  // loginGoogle() {}
  //
  //
  // @Public()
  // @Get('google/callback')
  // @UseGuards(GoogleAuthGuard)
  // async googleCallback(@Req() req) {
  //   console.log(req.user);
  //   return await this.authService.generateTokenAfterCallBack(req);
  // }
}
