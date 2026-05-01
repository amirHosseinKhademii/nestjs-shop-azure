import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  /** Validates Bearer JWT (gateway forwards user token). */
  @Get('me')
  async me(@Headers('authorization') authHeader?: string) {
    const token = authHeader?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException();
    try {
      const decoded = await this.jwt.verifyAsync<{ sub: string }>(token);
      const u = await this.auth.validateUser(decoded.sub);
      if (!u) throw new UnauthorizedException();
      return {
        id: u.id,
        email: u.email,
        displayName: u.displayName,
      };
    } catch {
      throw new UnauthorizedException();
    }
  }
}
