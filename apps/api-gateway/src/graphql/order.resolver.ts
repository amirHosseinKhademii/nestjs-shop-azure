import { Resolver, Query, Args, Context } from '@nestjs/graphql';
import { UnauthorizedException, UseGuards } from '@nestjs/common';
import { GqlJwtGuard } from './gql-jwt.guard';
import { OrderGql } from './types';
import { BackendHttpService } from '../backend-http.service';
import type { GatewayGraphqlContext, OrderDto, OrderLineDto } from './graphql-context';

@Resolver()
export class OrderResolver {
  constructor(private readonly backend: BackendHttpService) {}

  @Query(() => [OrderGql])
  @UseGuards(GqlJwtGuard)
  async orders(@Context() ctx: GatewayGraphqlContext) {
    const userId = ctx.req.user?.sub;
    if (!userId) throw new UnauthorizedException();
    const raw = await this.backend.orders(userId, ctx.correlationId);
    return (raw as OrderDto[]).map((o) => ({
      id: o.id,
      userId: o.userId,
      cartId: o.cartId,
      correlationId: o.correlationId,
      status: o.status,
      lines: (o.lines ?? []).map((l: OrderLineDto) => ({
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
    const o = await this.backend.order(userId, id, ctx.correlationId);
    if (!o) return null;
    const dto = o as OrderDto;
    return {
      id: dto.id,
      userId: dto.userId,
      cartId: dto.cartId,
      correlationId: dto.correlationId,
      status: dto.status,
      lines: (dto.lines ?? []).map((l: OrderLineDto) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        priceCents: l.priceCents,
      })),
    };
  }
}
