import { Resolver, Query, Mutation, Args, Context, Int } from '@nestjs/graphql';
import { UnauthorizedException, UseGuards } from '@nestjs/common';
import { GqlJwtGuard } from './gql-jwt.guard';
import { ProductGql, CartGql, CheckoutResultGql } from './types';
import { BackendContractsService } from '../contracts/backend-contracts.service';
import { unwrapOrThrow } from '../contracts/openapi-helpers';
import type { GatewayGraphqlContext } from './graphql-context';

@Resolver()
export class ShopResolver {
  constructor(private readonly backends: BackendContractsService) {}

  @Query(() => [ProductGql])
  async products(@Context() ctx: { correlationId?: string }) {
    const res = await this.backends.shop.GET('/products', {
      params: {
        header: ctx?.correlationId ? { 'x-correlation-id': ctx.correlationId } : ({} as never),
      },
    });
    const raw = unwrapOrThrow(res);
    return raw.map((p) => ({
      id: String((p as { _id?: string; id?: string })._id ?? (p as { id?: string }).id),
      name: p.name,
      description: (p as { description?: string | null }).description ?? undefined,
      priceCents: p.priceCents,
      stock: (p as { stock?: number | null }).stock ?? undefined,
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
    const res = await this.backends.shop.POST('/products', {
      body: { name, priceCents, description, stock },
      params: {
        header: ctx?.correlationId ? { 'x-correlation-id': ctx.correlationId } : ({} as never),
      },
    });
    const created = unwrapOrThrow(res);
    return {
      id: String((created as { _id?: string; id?: string })._id ?? (created as { id?: string }).id),
      name: created.name,
      description: (created as { description?: string | null }).description ?? undefined,
      priceCents: created.priceCents,
      stock: (created as { stock?: number | null }).stock ?? undefined,
    };
  }

  @Query(() => CartGql)
  @UseGuards(GqlJwtGuard)
  async cart(@Context() ctx: GatewayGraphqlContext) {
    const userId = ctx.req.user?.sub;
    if (!userId) throw new UnauthorizedException();
    const res = await this.backends.shop.GET('/cart', {
      params: {
        header: {
          'x-user-id': userId,
          ...(ctx.correlationId ? { 'x-correlation-id': ctx.correlationId } : {}),
        },
      },
    });
    return unwrapOrThrow(res) as CartGql;
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
    const res = await this.backends.shop.POST('/cart/items', {
      body: { productId, qty },
      params: {
        header: {
          'x-user-id': userId,
          ...(ctx.correlationId ? { 'x-correlation-id': ctx.correlationId } : {}),
        },
      },
    });
    return unwrapOrThrow(res) as CartGql;
  }

  @Mutation(() => CheckoutResultGql)
  @UseGuards(GqlJwtGuard)
  async checkout(@Context() ctx: GatewayGraphqlContext) {
    const userId = ctx.req.user?.sub;
    if (!userId) throw new UnauthorizedException();
    const correlationId = ctx.req.correlationId ?? ctx.correlationId;
    const res = await this.backends.shop.POST('/checkout', {
      params: {
        header: {
          'x-user-id': userId,
          ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
        },
      },
    });
    return unwrapOrThrow(res) as CheckoutResultGql;
  }
}
