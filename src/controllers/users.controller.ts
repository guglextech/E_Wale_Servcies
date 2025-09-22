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
  @Delete()
  deleteUser(@Query('username') username: string) {
    return this.usersService.removeUser(username);
  }
}
