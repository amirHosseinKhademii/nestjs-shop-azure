import { Resolver, Mutation, Args, Query, Context } from '@nestjs/graphql';
import { UnauthorizedException, UseGuards } from '@nestjs/common';
import { GqlJwtGuard } from './gql-jwt.guard';
import { AuthPayloadGql, UserGql } from './types';
import { BackendContractsService } from '../contracts/backend-contracts.service';
import { unwrapOrThrow } from '../contracts/openapi-helpers';
import type { GatewayGraphqlContext } from './graphql-context';

@Resolver()
export class AuthResolver {
  constructor(private readonly backends: BackendContractsService) {}

  @Mutation(() => AuthPayloadGql)
  async register(
    @Args('email') email: string,
    @Args('password') password: string,
    @Args('displayName', { nullable: true }) displayName?: string,
    @Context() ctx?: { correlationId?: string },
  ) {
    const res = await this.backends.user.POST('/auth/register', {
      body: { email, password, displayName },
      params: {
        header: ctx?.correlationId ? { 'x-correlation-id': ctx.correlationId } : ({} as never),
      },
    });
    return unwrapOrThrow(res) as AuthPayloadGql;
  }

  @Mutation(() => AuthPayloadGql)
  async login(
    @Args('email') email: string,
    @Args('password') password: string,
    @Context() ctx?: { correlationId?: string },
  ) {
    const res = await this.backends.user.POST('/auth/login', {
      body: { email, password },
      params: {
        header: ctx?.correlationId ? { 'x-correlation-id': ctx.correlationId } : ({} as never),
      },
    });
    return unwrapOrThrow(res) as AuthPayloadGql;
  }

  @Query(() => UserGql)
  @UseGuards(GqlJwtGuard)
  async me(@Context() ctx: GatewayGraphqlContext) {
    const userId = ctx.req.user?.sub;
    if (!userId) throw new UnauthorizedException();
    const res = await this.backends.user.GET('/auth/me', {
      params: {
        header: {
          'x-user-id': userId,
          ...(ctx.correlationId ? { 'x-correlation-id': ctx.correlationId } : {}),
        },
      },
    });
    return unwrapOrThrow(res) as UserGql;
  }
}
