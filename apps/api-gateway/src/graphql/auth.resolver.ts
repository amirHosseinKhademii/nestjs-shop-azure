import { Resolver, Mutation, Args, Query, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlJwtGuard } from './gql-jwt.guard';
import { AuthPayloadGql, UserGql } from './types';
import { BackendHttpService } from '../backend-http.service';
import type { GatewayGraphqlContext } from './graphql-context';

@Resolver()
export class AuthResolver {
  constructor(private readonly backend: BackendHttpService) {}

  @Mutation(() => AuthPayloadGql)
  async register(
    @Args('email') email: string,
    @Args('password') password: string,
    @Args('displayName', { nullable: true }) displayName?: string,
    @Context() ctx?: { correlationId?: string },
  ) {
    return this.backend.register(
      { email, password, displayName },
      ctx?.correlationId,
    ) as Promise<AuthPayloadGql>;
  }

  @Mutation(() => AuthPayloadGql)
  async login(
    @Args('email') email: string,
    @Args('password') password: string,
    @Context() ctx?: { correlationId?: string },
  ) {
    return this.backend.login({ email, password }, ctx?.correlationId) as Promise<AuthPayloadGql>;
  }

  @Query(() => UserGql)
  @UseGuards(GqlJwtGuard)
  async me(@Context() ctx: GatewayGraphqlContext) {
    const auth = ctx.req.headers?.authorization as string | undefined;
    return this.backend.me(auth, ctx.correlationId) as Promise<UserGql>;
  }
}
