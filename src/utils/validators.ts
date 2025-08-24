import { registerDecorator, ValidationArguments, ValidationOptions } from "class-validator";
import { SetMetadata } from "@nestjs/common";
import { Role } from "../models/schemas/enums/role.enum";
import * as process from "process";
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from "bcrypt";

export function ValidPassword(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isValidPassword',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [],
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments){
          return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%^&+=]).{9,20}$/.test(value);
        },
      },
    });
  };
}

export const jwtConstants = {
  secret: process.env.JWT_SECRETE || 'vote-cast-is-live',
  expireDate: process.env.JWT_EXPIRY || '500s'
};

export function extractTokenFromHeader(request: Request): string | undefined {
  const [type, token] = request.headers['authorization']?.split(' ') ?? [];
  return type === 'Bearer' ? token : undefined;
}

export function generateRandomString(length: number) {
  const characters =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

export function genrUuid() {
  return uuidv4();
}
export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
