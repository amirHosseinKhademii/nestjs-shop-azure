import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ShopService } from './shop.service';
import { CheckoutPublisherService } from './checkout-publisher.service';
import { CreateProductDto } from './dto/create-product.dto';
import { randomUUID } from 'crypto';

@Controller()
export class ShopController {
  constructor(
    private readonly shop: ShopService,
    private readonly checkoutPublisher: CheckoutPublisherService,
  ) {}

  private assertInternal(key?: string) {
    const expected = process.env.INTERNAL_API_KEY ?? 'dev-internal-key';
    if (!key || key !== expected) throw new UnauthorizedException();
  }

  @Get('products')
  listProducts() {
    return this.shop.listProducts();
  }

  @Post('products')
  createProduct(@Headers('x-internal-key') key: string | undefined, @Body() dto: CreateProductDto) {
    this.assertInternal(key);
    return this.shop.createProduct(dto);
  }

  @Get('cart')
  getCart(@Headers('x-user-id') userId?: string, @Headers('x-internal-key') key?: string) {
    this.assertInternal(key);
    if (!userId) throw new BadRequestException('Missing X-User-Id');
    return this.shop.getCart(userId);
  }

  @Post('cart/items')
  addToCart(
    @Headers('x-user-id') userId: string | undefined,
    @Headers('x-internal-key') key: string | undefined,
    @Body() body: { productId: string; qty: number },
  ) {
    this.assertInternal(key);
    if (!userId) throw new BadRequestException('Missing X-User-Id');
    return this.shop.addToCart(userId, body.productId, body.qty);
  }

  @Post('checkout')
  async checkout(
    @Headers('x-user-id') userId: string | undefined,
    @Headers('x-internal-key') key: string | undefined,
    @Headers('x-correlation-id') corr?: string,
  ) {
    this.assertInternal(key);
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
