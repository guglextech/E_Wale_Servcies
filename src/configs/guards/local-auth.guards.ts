import { AuthGuard } from "@nestjs/passport";


export class LoginAuthGuard extends AuthGuard('local-login') {}
export class GoogleAuthGuard extends AuthGuard('google') {}