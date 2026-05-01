import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class GqlJwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const gql = GqlExecutionContext.create(context);
    const { req } = gql.getContext<{ req: any }>();
    const auth = req.headers?.authorization as string | undefined;
    const token = auth?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException();
    try {
      const payload = this.jwt.verify<{ sub: string; email: string }>(token);
      req.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
