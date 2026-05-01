import { Resolver, Query, Mutation, Args, Context, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlJwtGuard } from './gql-jwt.guard';
import {
  ProductGql,
  CartGql,
  CheckoutResultGql,
} from './types';
import { BackendHttpService } from '../backend-http.service';

@Resolver()
export class ShopResolver {
  constructor(private readonly backend: BackendHttpService) {}

  @Query(() => [ProductGql])
  async products(@Context() ctx: { correlationId?: string }) {
    const raw = await this.backend.products(ctx.correlationId);
    return raw.map((p: any) => ({
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
    const p = await this.backend.createProduct(
      {
        name,
        priceCents,
        description,
        stock,
      },
      ctx?.correlationId,
    );
    return {
      id: String((p as any)._id ?? (p as any).id),
      name: (p as any).name,
      description: (p as any).description,
      priceCents: (p as any).priceCents,
      stock: (p as any).stock,
    };
  }

  @Query(() => CartGql)
  @UseGuards(GqlJwtGuard)
  async cart(@Context() ctx: { req: any; correlationId?: string }) {
    const userId = ctx.req.user.sub as string;
    return this.backend.cart(userId, ctx.correlationId) as Promise<CartGql>;
  }

  @Mutation(() => CartGql)
  @UseGuards(GqlJwtGuard)
  async addToCart(
    @Context() ctx: { req: any; correlationId?: string },
    @Args('productId') productId: string,
    @Args('qty', { type: () => Int }) qty: number,
  ) {
    const userId = ctx.req.user.sub as string;
    return this.backend.addToCart(
      userId,
      { productId, qty },
      ctx.correlationId,
    ) as Promise<CartGql>;
  }

  @Mutation(() => CheckoutResultGql)
  @UseGuards(GqlJwtGuard)
  async checkout(@Context() ctx: { req: any; correlationId?: string }) {
    const userId = ctx.req.user.sub as string;
    const correlationId = ctx.req.correlationId ?? ctx.correlationId;
    return this.backend.checkout(userId, correlationId) as Promise<CheckoutResultGql>;
  }
}
