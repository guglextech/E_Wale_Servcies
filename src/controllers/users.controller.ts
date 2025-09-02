import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Patch,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { UsersService } from "../services/users.service";
import { RoleAuthGuard } from "../configs/guards/role-auth.guard";
import { Public, Roles } from "../utils/validators";
import { Role } from "../models/schemas/enums/role.enum";
import { ApiTags } from "@nestjs/swagger";
import { PermissionDto } from "../models/dto/user-perm.dto";
import { UserRoleDto } from "../models/dto/user-role.dto";
import { UpdateUserDto, UpdateUserPasswordDto } from "../models/dto/update-user.dto";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthService } from "../services/auth.service";
import { customResponse } from "../utils/responses";

@Controller('api/v1/users')
@ApiTags("User")
export class UsersController {
  constructor(private readonly usersService: UsersService,
    private readonly authService: AuthService) { }

  @Roles(Role.Admin, Role.User)
  @UseGuards(RoleAuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return this.usersService.getProfile(req.user.jti);
  }

  @Roles(Role.Admin)
  @UseGuards(RoleAuthGuard)
  @Get()
  getUserDetails(@Query('username') username: string) {
    return this.usersService.getProfileByUsername(username);
  }

  @Roles(Role.Admin)
  @UseGuards(RoleAuthGuard)
  @Get("all")
  find(@Query('page') page: number = 1,
    @Query('limit') limit: number = 1) {
    return this.usersService.findAll(page, limit);
  }

  @Roles(Role.Admin)
  @UseGuards(RoleAuthGuard)
  @Patch("update-role")
  async updateUserRole(@Body() req: UserRoleDto) {
    return this.usersService.updateUserRole(req);
  }

  @Roles(Role.Admin)
  @UseGuards(RoleAuthGuard)
  @Patch("permissions")
  async updatePermissions(@Body() req: PermissionDto) {
    return this.usersService.updatePermissions(req);
  }

  @Roles(Role.Admin, Role.User)
  @UseGuards(RoleAuthGuard)
  @Patch("update-user")
  async updateUser(@Body() req: UpdateUserDto) {
    return this.usersService.updateUserBy(req);
  }

  @Public()
  @Get("forgot-password")
  async forgotPassword(@Request() hReq, @Query('username') username: string) {
    return await this.usersService.sendResetEmail(username);
  }

  @Roles(Role.Admin, Role.User)
  @UseGuards(RoleAuthGuard)
  @Patch("change-password")
  async changeUserPassword(@Request() hReq, @Body() req: UpdateUserPasswordDto) {
    const userId = hReq.user.jti;
    const resp = await this.authService.validateUserByUserId(userId, req.oldPassword);
    if (resp != null) {
      const hashedPassword = await this.authService.encryptString(req.newPassword);
      return await this.usersService.updateUserPass(userId, hashedPassword);
    } else {
      return {
        "response": new HttpException(customResponse.failed, 400)
      };
    }
  }

  @Roles(Role.Admin)
  @UseGuards(RoleAuthGuard)
  @Delete()
  deleteUser(@Query('username') username: string) {
    return this.usersService.removeUser(username);
  }

  @Public()
  @Get('send')
  sendEmailAPi() {
    return this.usersService.sendEmail("stevenfianu99@gmail.com", "Testing", "Worked !!!!");
  }


}
