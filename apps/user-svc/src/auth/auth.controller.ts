import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

/**
 * `register`/`login` are public — they're how users get a JWT in the first place.
 * `me` trusts `x-user-id` set by the api-gateway after JWT verification; network
 * access to user-svc is restricted to the gateway via NetworkPolicy / compose net.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  async me(@Headers('x-user-id') userId?: string) {
    if (!userId) throw new BadRequestException('Missing X-User-Id');
    const u = await this.auth.validateUser(userId);
    if (!u) throw new NotFoundException();
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
    };
  }
}
