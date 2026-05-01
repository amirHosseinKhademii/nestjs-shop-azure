import { Resolver, Query, Args, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlJwtGuard } from './gql-jwt.guard';
import { OrderGql } from './types';
import { BackendHttpService } from '../backend-http.service';

@Resolver()
export class OrderResolver {
  constructor(private readonly backend: BackendHttpService) {}

  @Query(() => [OrderGql])
  @UseGuards(GqlJwtGuard)
  async orders(@Context() ctx: { req: any; correlationId?: string }) {
    const userId = ctx.req.user.sub as string;
    const raw = await this.backend.orders(userId, ctx.correlationId);
    return (raw as any[]).map((o) => ({
      id: o.id,
      userId: o.userId,
      cartId: o.cartId,
      correlationId: o.correlationId,
      status: o.status,
      lines: (o.lines ?? []).map((l: any) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        priceCents: l.priceCents,
      })),
    }));
  }

  @Query(() => OrderGql, { nullable: true })
  @UseGuards(GqlJwtGuard)
  async order(
    @Context() ctx: { req: any; correlationId?: string },
    @Args('id') id: string,
  ) {
    const userId = ctx.req.user.sub as string;
    const o = await this.backend.order(userId, id, ctx.correlationId);
    if (!o) return null;
    return {
      id: (o as any).id,
      userId: (o as any).userId,
      cartId: (o as any).cartId,
      correlationId: (o as any).correlationId,
      status: (o as any).status,
      lines: ((o as any).lines ?? []).map((l: any) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        priceCents: l.priceCents,
      })),
    };
  }
}
