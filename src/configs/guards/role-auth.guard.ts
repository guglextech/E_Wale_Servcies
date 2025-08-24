import {CanActivate, ExecutionContext, Injectable, UnauthorizedException} from "@nestjs/common";
import {JwtService} from "@nestjs/jwt";
import {extractTokenFromHeader, jwtConstants, ROLES_KEY} from "../../utils/validators";
import {Reflector} from "@nestjs/core";
import {Role} from "../../models/schemas/enums/role.enum";


@Injectable()
export class RoleAuthGuard implements CanActivate {

  constructor(private jwtService: JwtService, private reflector: Reflector) {
  }
  async canActivate(context: ExecutionContext){
    const req = context.switchToHttp().getRequest();

    const roles = this.reflector.getAllAndOverride<Role>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const token = extractTokenFromHeader(req);
    if (!token) {
      throw new UnauthorizedException();
    }
    try {
      req['user'] = await this.jwtService.verifyAsync(token, { secret: jwtConstants.secret });
      const userRole = req.user.sub.toLowerCase();
      // console.log("user's current role == " + userRole);
      // console.log("allowed role to access == " + roles)
      // let isAllowed = roles.includes(userRole);
      // console.log("is allowed == " + isAllowed)
      return roles.includes(userRole);
    }
    catch {
      throw new UnauthorizedException();
    }
  }

}