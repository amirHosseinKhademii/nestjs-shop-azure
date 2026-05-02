import { Body, Controller, Post } from '@nestjs/common';
import { orderCheckoutHandleSeconds } from '@shop/observability';
import { CheckoutEventDto } from './dto/checkout-event.dto';
import { OrderService } from './order.service';

/**
 * Internal HTTP entrypoint for shop-svc → order-svc when CHECKOUT_TRANSPORT=http.
 * Network access is restricted via NetworkPolicy (cluster) / compose network (dev).
 */
@Controller('internal')
export class InternalController {
  constructor(private readonly orders: OrderService) {}

  @Post('checkout')
  async checkout(@Body() body: CheckoutEventDto) {
    const idempotencyKey = body.correlationId;
    const endTimer = orderCheckoutHandleSeconds.startTimer({ source: 'http' });
    try {
      const order = await this.orders.createOrderFromCheckout(body, idempotencyKey);
      return { orderId: order.id, correlationId: body.correlationId };
    } finally {
      endTimer();
    }
  }
}
