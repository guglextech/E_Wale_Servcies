import {HttpException, HttpStatus, Injectable} from "@nestjs/common";
import {JwtService} from "@nestjs/jwt";
import {UsersService} from "./users.service";
import * as bcrypt from "bcrypt";
import {InjectModel} from "@nestjs/mongoose";
import {Model} from "mongoose";
import {User} from "../models/schemas/user.shema";
import {genrUuid, jwtConstants} from "../utils/validators";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectModel(User.name) private userModel: Model<User>
  ) {}

  async createUser(createUserDto: any)  {
    try {
      const hashedPassword = await this.encryptString(createUserDto.password);
      const user = new User();
      user.userId = genrUuid();
      user.username = createUserDto.username;
      user.password = hashedPassword;
      user.role = createUserDto.role;
      user.firstname = createUserDto.firstname;
      user.lastname = createUserDto.lastname;
      user.photo = createUserDto.photo;
      user.phone = createUserDto.phone;
      user.createdAt = new Date();
      user.permissions = createUserDto.permissions;
      user.authType = 'Normal';
      user.userDescription = createUserDto.userDescription;
      user.updatedAt = new Date();

      await new this.userModel(user).save();
    }catch (error) {
      console.log(error);
      return {
        "response" :new HttpException('FAILED', HttpStatus.INTERNAL_SERVER_ERROR)
      }
    }
    return {
      "response" :new HttpException('SUCCESS', HttpStatus.CREATED)
    }
  }

  async createUser2(user: User)  {
    try {
      await new this.userModel(user).save();
      return user;
    }catch (error) {
      console.log(error);
    }
  }

  async validateUser(username: string, password: string){
    const user = await this.findUser(username);
    if (!user) {
      return null;
    }
    const userObj = (user.toObject() as User);
    if (userObj && (await bcrypt.compare(password, user.password))) {
      const { password, ...result} = userObj;
      return result;
    }
    return null
  }

  async validateUserByUserId(userId: string, password: string){
    const user = await this.usersService.findUserByUserId(userId);
    if (!user) {
      return null;
    }
    const userObj = (user.toObject() as User);
    if (userObj && (await bcrypt.compare(password, user.password))) {
      const { password, ...result} = userObj;
      return result;
    }
    return null
  }

  async findUser(username: string) {
    const user = await this.usersService.findUserByEmail(username);
    if (!user) {
      return null;
    }
    return user;
  }

  async generateTokenAfterCallBack (req: any) {
    const username = req.user.username;
    const user = await this.findUser(username);
    console.log(user);
    const payload = { sub: user.role, jti: user.userId }
    return {
      "response": new HttpException('SUCCESS', HttpStatus.OK),
      "token" : this.jwtService.sign(
        payload,
        {
          secret: jwtConstants.secret,
          expiresIn: jwtConstants.expireDate
        })
    };
  }

  async encryptString(value: string) {
    return await bcrypt.hash(value, 10);
  }
}
