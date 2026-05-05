import { Resolver, Query, Args, Context } from '@nestjs/graphql';
import { UnauthorizedException, UseGuards } from '@nestjs/common';
import { GqlJwtGuard } from './gql-jwt.guard';
import { OrderGql } from './types';
import { BackendContractsService } from '../contracts/backend-contracts.service';
import { unwrapOrThrow } from '../contracts/openapi-helpers';
import type { GatewayGraphqlContext } from './graphql-context';

@Resolver()
export class OrderResolver {
  constructor(private readonly backends: BackendContractsService) {}

  @Query(() => [OrderGql])
  @UseGuards(GqlJwtGuard)
  async orders(@Context() ctx: GatewayGraphqlContext) {
    const userId = ctx.req.user?.sub;
    if (!userId) throw new UnauthorizedException();
    const res = await this.backends.order.GET('/orders', {
      params: {
        header: {
          'x-user-id': userId,
          ...(ctx.correlationId ? { 'x-correlation-id': ctx.correlationId } : {}),
        },
      },
    });
    const raw = unwrapOrThrow(res);
    return raw.map((o) => ({
      id: o.id,
      userId: o.userId,
      cartId: o.cartId,
      correlationId: o.correlationId,
      status: o.status,
      lines: (o.lines ?? []).map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        priceCents: l.priceCents,
      })),
    }));
  }

  @Query(() => OrderGql, { nullable: true })
  @UseGuards(GqlJwtGuard)
  async order(@Context() ctx: GatewayGraphqlContext, @Args('id') id: string) {
    const userId = ctx.req.user?.sub;
    if (!userId) throw new UnauthorizedException();
    const res = await this.backends.order.GET('/orders/{id}', {
      params: {
        path: { id },
        header: {
          'x-user-id': userId,
          ...(ctx.correlationId ? { 'x-correlation-id': ctx.correlationId } : {}),
        },
      },
    });
    if (res.error) return null;
    const dto = unwrapOrThrow(res);
    return {
      id: dto.id,
      userId: dto.userId,
      cartId: dto.cartId,
      correlationId: dto.correlationId,
      status: dto.status,
      lines: (dto.lines ?? []).map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        priceCents: l.priceCents,
      })),
    };
  }
}
