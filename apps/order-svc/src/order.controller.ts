import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UnauthorizedException,
} from '@nestjs/common';
import { OrderService } from './order.service';

/**
 * `x-user-id` is set by the api-gateway after JWT verification.
 * Network access is restricted to the gateway via NetworkPolicy
 * (or the docker-compose internal network in dev).
 */
@Controller('orders')
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Get()
  list(@Headers('x-user-id') userId?: string) {
    if (!userId) throw new UnauthorizedException('Missing X-User-Id');
    return this.orders.listOrdersForUser(userId);
  }

  @Get(':id')
  async one(
    @Headers('x-user-id') userId: string | undefined,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    if (!userId) throw new UnauthorizedException('Missing X-User-Id');
    const order = await this.orders.getOrder(userId, id);
    if (!order) throw new NotFoundException();
    return order;
  }
}
