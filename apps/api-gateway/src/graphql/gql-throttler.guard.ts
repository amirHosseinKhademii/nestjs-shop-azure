import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { GatewayGraphqlContext } from './graphql-context';

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext) {
    if (context.getType() === 'http') {
      const http = context.switchToHttp();
      return { req: http.getRequest(), res: http.getResponse() };
    }
    const gqlCtx = GqlExecutionContext.create(context);
    const gqlContext = gqlCtx.getContext<GatewayGraphqlContext>();
    const req = gqlContext.req;
    const res = gqlContext.res ?? req?.res;
    return { req, res };
  }
}
