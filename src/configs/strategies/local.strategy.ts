import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-local";
import { AuthService } from "../../services/auth.service";
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { jwtConstants } from "../../utils/validators";
import { JwtService } from "@nestjs/jwt";


@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local-login') {
  constructor(private authService: AuthService,
              private jwtService: JwtService) {
    super();
  }

  async validate(username: string, password: string) {
    const user = await this.authService.validateUser(username, password)
    if (!user) {
      return {
        "response": new HttpException('UNAUTHORIZED', HttpStatus.UNAUTHORIZED),
        "token" : null
      };
    }
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


}