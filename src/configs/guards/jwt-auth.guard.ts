import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { extractTokenFromHeader, IS_PUBLIC_KEY, jwtConstants } from "../../utils/validators";
import { Reflector } from "@nestjs/core";


@Injectable()
export class AuthGuards implements CanActivate {

  constructor(private jwtService: JwtService, private reflector: Reflector) {
  }
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const token = extractTokenFromHeader(req);
    if (!token) {
      throw new UnauthorizedException();
    }
    try {
      req['user'] = await this.jwtService.verifyAsync(token, { secret: jwtConstants.secret });
    }
    catch {
      throw new UnauthorizedException();
    }
    return true;
  }

}