import {HttpException, HttpStatus, Injectable} from "@nestjs/common";
import {UpdateUserDto} from "../models/dto/update-user.dto";
import {InjectModel} from "@nestjs/mongoose";
import {Model} from "mongoose";
import {User} from "../models/schemas/user.shema";
import {CustomPaginator, customResponse} from "../utils/responses";
import {PermissionDto} from "../models/dto/user-perm.dto";
import {UserRoleDto} from "../models/dto/user-role.dto";
import * as nodemailer from "nodemailer";
import {DeleteResult} from 'mongodb';

@Injectable()
export class UsersService {
  constructor(
    // @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectModel(User.name) private userModel: Model<User>,
    // ,
  ) {}

  async sendEmail(to: string, subject: string, text: string): Promise<void> {
    // Initialize nodemailer transporter (replace with your email provider's settings)
    const transporter = nodemailer.createTransport({
      host: 'email-smtp.eu-central-1.amazonaws.com',
      port: 587,
      secure: false, // Set to true if using SSL
      auth: {
        user: 'AKIAVFTCPCNUJAOPZMY7',
        pass: 'BAGTW4Rlg3uPbWspyq42vU/dcnH+Cu3lJjoGlkrJGbeV',
      }});
    await transporter.sendMail({
      from: 'no-reply@devmail.mojo.com.lb',
      to,
      subject,
      text,
    });
  }

  async getProfile(userId: string) {
    try {
      const user = await this.findUserByUserId(userId);
      const userObj = (user.toObject() as User);
      if (userObj) {
        const excludedFields = ['password', '__v'];
        const result = Object.keys(userObj).reduce((acc, key) => {
          if (!excludedFields.includes(key)) {
            acc[key] = userObj[key];
          }
          return acc;
        }, {});
        return {
          "response": new HttpException(customResponse.success, HttpStatus.OK),
          "result": result
        };
      }
      return {
        "response": new HttpException(customResponse.failed, 400),
        "result": null
      };
    }
    catch (e) {
      console.log(e);
      return {
        "response": new HttpException(customResponse.empty, 405),
        "result": null
      };
    }
  }
  async getProfileByUsername(username: string) {
    try {
      const user = await this.findUserByEmail(username);
      const userObj = (user.toObject() as User);
      if (userObj) {
        const excludedFields = ['password', '__v'];
        const result = Object.keys(userObj).reduce((acc, key) => {
          if (!excludedFields.includes(key)) {
            acc[key] = userObj[key];
          }
          return acc;
        }, {});
        return {
          "response": new HttpException(customResponse.success, HttpStatus.OK),
          "result": result
        };
      }
      return {
        "response": new HttpException(customResponse.failed, 400),
        "result": null
      };
    }
    catch (e) {
      return {
        "response": new HttpException(customResponse.empty, 405),
        "result": null
      };
    }
  }

  async findUserByEmail(username: string) {
    return await this.userModel.findOne({ username }).exec();
  }

  async findUserByUserId(userId: string) {
   return await this.userModel.findOne({ userId }).exec();
  }

  async findAll(page: number, limit: number) {
    const totalCount = await this.userModel.countDocuments();

    const paginator = new CustomPaginator()
    paginator.nextPage = (page * limit) > totalCount ? -1 : 1;
    paginator.requestedPageSize = limit;
    paginator.totalPages = totalCount;

    const excludedFields = ['password', '__v'];

    const users = await this.userModel
      .find()
      .sort({ _id: -1 })
      .skip((page - 1) * limit)
      .select({ _id: 0, ...excludedFields.reduce((acc, field) => ({ ...acc, [field]: 0 }), {}) })
      .limit(limit).exec();
    return {
      "response": users.length === 0
        ? new HttpException(customResponse.empty, HttpStatus.NO_CONTENT)
        : new HttpException(customResponse.success, HttpStatus.OK ),
      "result": users,
      paginator
    };
  }

  async updateUserRole(req: UserRoleDto) {
    try {
      const result = await this.userModel.findOneAndUpdate(
        { "username": req.username },
        {
          "role": req.role,
          "updateAt": new Date(),
        },
        {new: true}
      );
      return {
        "response": result != null ? new HttpException(customResponse.success, HttpStatus.OK)
          : new HttpException(customResponse.failed, 400)
      }
    }catch (error) {
      return {
        "response": new HttpException(customResponse.failed, 400)
      };
    }
  }

  async updatePermissions(req: PermissionDto) {
    try {
      const result = await this.userModel.findOneAndUpdate(
        { username: req.username },
        {
          permissions: req.permissions,
          userDescription: req.userDescription,
          updatedAt: new Date(),
        },
        {new: true}
      );
      return {
        "response": result != null ? new HttpException(customResponse.success, HttpStatus.OK)
          : new HttpException(customResponse.failed, 400)
      }
    }catch (error) {
      console.log(error);
      return {
        "response": new HttpException(customResponse.failed, 400)
      };
    }
  }

  async updateUserBy(req: UpdateUserDto) {
    try {
      const result = await this.userModel.findOneAndUpdate(
        { username: req.username },
        {
          role: req.role,
          firstname: req.firstname,
          lastname: req.lastname,
          photo: req.photo,
          phone: req.phone,
          updatedAt: new Date(),
        },
        {new: true}
      );
      console.log(result);
      return {
        "response": result != null ? new HttpException(customResponse.success, HttpStatus.OK)
          : new HttpException(customResponse.failed, 400)
      }
    }catch (error) {
      console.log(error);
      return {
        "response": new HttpException(customResponse.failed, 400)
      };
    }
  }

  async removeUser(username: string) {
    try{
      const result: DeleteResult = await this.userModel.deleteOne({ "username": username}).exec();
      return {
        "response": result != null
          ? new HttpException(customResponse.success, HttpStatus.OK )
          : new HttpException(customResponse.failed, 400),
        "result": result
      };
    }catch (error) {
      return {
        "response": new HttpException(customResponse.empty, HttpStatus.NO_CONTENT)
      }
    }
  }

  async updateUserPass(userId: string, hashedPassword: string) {
    try {
      const result = await this.userModel.findOneAndUpdate(
          { userId: userId },
          {
            password: hashedPassword,
            updatedAt: new Date(),
          },
          {new: true}
      );
      return {
        "response": result != null ? new HttpException(customResponse.success, HttpStatus.OK)
            : new HttpException(customResponse.failed, 400)
      }
    }catch (error) {
      console.log(error);
      return {
        "response": new HttpException(customResponse.failed, 400)
      };
    }
  }

  async sendResetEmail(username: string) {
    return Promise.resolve(undefined);
  }
}
