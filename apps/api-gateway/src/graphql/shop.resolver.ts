import { Resolver, Query, Mutation, Args, Context, Int } from '@nestjs/graphql';
import { UnauthorizedException, UseGuards } from '@nestjs/common';
import { GqlJwtGuard } from './gql-jwt.guard';
import { ProductGql, CartGql, CheckoutResultGql } from './types';
import { BackendHttpService } from '../backend-http.service';
import type { GatewayGraphqlContext, ShopProductDto } from './graphql-context';

@Resolver()
export class ShopResolver {
  constructor(private readonly backend: BackendHttpService) {}

  @Query(() => [ProductGql])
  async products(@Context() ctx: { correlationId?: string }) {
    const raw = await this.backend.products(ctx.correlationId);
    return (raw as ShopProductDto[]).map((p) => ({
      id: String(p._id ?? p.id),
      name: p.name,
      description: p.description,
      priceCents: p.priceCents,
      stock: p.stock,
    }));
  }

  @Mutation(() => ProductGql)
  async createProduct(
    @Args('name') name: string,
    @Args('priceCents', { type: () => Int }) priceCents: number,
    @Args('description', { nullable: true }) description?: string,
    @Args('stock', { nullable: true, type: () => Int }) stock?: number,
    @Context() ctx?: { correlationId?: string },
  ) {
    const created = (await this.backend.createProduct(
      {
        name,
        priceCents,
        description,
        stock,
      },
      ctx?.correlationId,
    )) as ShopProductDto;
    return {
      id: String(created._id ?? created.id),
      name: created.name,
      description: created.description,
      priceCents: created.priceCents,
      stock: created.stock,
    };
  }

  @Query(() => CartGql)
  @UseGuards(GqlJwtGuard)
  async cart(@Context() ctx: GatewayGraphqlContext) {
    const userId = ctx.req.user?.sub;
    if (!userId) throw new UnauthorizedException();
    return this.backend.cart(userId, ctx.correlationId) as Promise<CartGql>;
  }

  @Mutation(() => CartGql)
  @UseGuards(GqlJwtGuard)
  async addToCart(
    @Context() ctx: GatewayGraphqlContext,
    @Args('productId') productId: string,
    @Args('qty', { type: () => Int }) qty: number,
  ) {
    const userId = ctx.req.user?.sub;
    if (!userId) throw new UnauthorizedException();
    return this.backend.addToCart(
      userId,
      { productId, qty },
      ctx.correlationId,
    ) as Promise<CartGql>;
  }

  @Mutation(() => CheckoutResultGql)
  @UseGuards(GqlJwtGuard)
  async checkout(@Context() ctx: GatewayGraphqlContext) {
    const userId = ctx.req.user?.sub;
    if (!userId) throw new UnauthorizedException();
    const correlationId = ctx.req.correlationId ?? ctx.correlationId;
    return this.backend.checkout(userId, correlationId) as Promise<CheckoutResultGql>;
  }
}
