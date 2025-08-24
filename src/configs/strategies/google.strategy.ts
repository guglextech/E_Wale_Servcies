import { PassportStrategy } from "@nestjs/passport";
import { Injectable } from "@nestjs/common";
import { Strategy } from "passport-google-oauth20";
import { AuthService } from "../../services/auth.service";
import { VerifyCallback } from "jsonwebtoken";
import { Role } from "../../models/schemas/enums/role.enum";
import { Profile } from "passport";
import { User } from "../../models/schemas/user.shema";
import * as process from "process";
import {genrUuid} from "../../utils/validators";


@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private authService: AuthService) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRETE,
      callbackURL: process.env.GOOGLE_CALL_BACK,
      scope: ['email', 'profile'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: Profile, cb: VerifyCallback){
    const email = profile.emails[0].value;
    console.log("OAUTH PROFILE ::: " + email);
    console.log("OAUTH ACCESS TOKEN ::: " + accessToken);
    let user: any;
    user = await this.authService.findUser(email);
    if (!user) {
      const user1 = new User();
      user1.userId = genrUuid();
      user1.username = email;
      user1.role = Role.Admin;
      user1.firstname = profile.name.givenName;
      user1.lastname = profile.name.familyName;
      user1.photo = profile.photos[0].value;
      user1.authType = 'OAUTH-GOOGLE';
      user1.updatedAt = new Date();
      user = await this.authService.createUser2(user1);
    }
    console.log("OAUTH USER ::: " + user);
    cb(null, user);
  }
}