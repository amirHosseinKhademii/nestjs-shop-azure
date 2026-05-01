import { BadRequestException, Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CheckoutPublisherService } from './checkout-publisher.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ShopService } from './shop.service';

/**
 * `x-user-id` is set by the api-gateway after JWT verification.
 * Network access is restricted to the gateway via NetworkPolicy
 * (or the docker-compose internal network in dev).
 */
@Controller()
export class ShopController {
  constructor(
    private readonly shop: ShopService,
    private readonly checkoutPublisher: CheckoutPublisherService,
  ) {}

  @Get('products')
  listProducts() {
    return this.shop.listProducts();
  }

  @Post('products')
  createProduct(@Body() dto: CreateProductDto) {
    return this.shop.createProduct(dto);
  }

  @Get('cart')
  getCart(@Headers('x-user-id') userId?: string) {
    if (!userId) throw new BadRequestException('Missing X-User-Id');
    return this.shop.getCart(userId);
  }

  @Post('cart/items')
  addToCart(
    @Headers('x-user-id') userId: string | undefined,
    @Body() body: { productId: string; qty: number },
  ) {
    if (!userId) throw new BadRequestException('Missing X-User-Id');
    return this.shop.addToCart(userId, body.productId, body.qty);
  }

  @Post('checkout')
  async checkout(
    @Headers('x-user-id') userId: string | undefined,
    @Headers('x-correlation-id') corr?: string,
  ) {
    if (!userId) throw new BadRequestException('Missing X-User-Id');
    const correlationId = corr ?? randomUUID();
    const snapshot = await this.shop.buildCheckoutPayload(userId, correlationId);
    const occurredAt = new Date().toISOString();
    const body = {
      eventType: 'CheckoutRequested' as const,
      schemaVersion: 1 as const,
      occurredAt,
      correlationId: snapshot.correlationId,
      userId: snapshot.userId,
      cartId: snapshot.cartId,
      payload: {
        productIds: snapshot.productIds,
        quantities: snapshot.quantities,
      },
    };
    const result = await this.checkoutPublisher.publishCheckout(body);
    await this.shop.clearCart(userId);
    return {
      accepted: true,
      correlationId: snapshot.correlationId,
      cartId: snapshot.cartId,
      channel: result.channel,
    };
  }
}
