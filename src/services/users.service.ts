import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { User } from "../models/schemas/user.shema";
import { customResponse } from "../utils/responses";

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>
  ) {}

  async getProfile(userId: string) {
    try {
      const user = await this.findUserByUserId(userId);
      if (!user) {
        return {
          response: new HttpException(customResponse.failed, 404),
          result: null
        };
      }
      
      const userObj = user.toObject() as User;
      const { password, ...result } = userObj;
      
      return {
        response: new HttpException(customResponse.success, HttpStatus.OK),
        result
      };
    } catch (error) {
      return {
        response: new HttpException(customResponse.failed, 500),
        result: null
      };
    }
  }

  
  async findUserByEmail(username: string) {
    return await this.userModel.findOne({ username }).exec();
  }

  async findUserByUserId(userId: string) {
    return await this.userModel.findOne({ userId }).exec();
  }

  async findAll() {
    try {
      const users = await this.userModel
        .find()
        .select('-password -__v')
        .sort({ createdAt: -1 })
        .exec();
      
      return {
        response: new HttpException(customResponse.success, HttpStatus.OK),
        result: users
      };
    } catch (error) {
      return {
        response: new HttpException(customResponse.failed, 500),
        result: []
      };
    }
  }

  async updateUser(userId: string, updateData: Partial<User>) {
    try {
      const result = await this.userModel.findOneAndUpdate(
        { userId },
        { ...updateData, updatedAt: new Date() },
        { new: true }
      ).select('-password -__v');

      return {
        response: result 
          ? new HttpException(customResponse.success, HttpStatus.OK)
          : new HttpException(customResponse.failed, 404)
      };
    } catch (error) {
      return {
        response: new HttpException(customResponse.failed, 500)
      };
    }
  }

  async removeUser(userId: string) {
    try {
      const result = await this.userModel.deleteOne({ userId }).exec();
      
      return {
        response: result.deletedCount > 0
          ? new HttpException(customResponse.success, HttpStatus.OK)
          : new HttpException(customResponse.failed, 404)
      };
    } catch (error) {
      return {
        response: new HttpException(customResponse.failed, 500)
      };
    }
  }
}