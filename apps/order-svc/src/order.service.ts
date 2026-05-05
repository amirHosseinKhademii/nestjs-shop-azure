import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ordersCreatedTotal } from '@shop/observability';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OrderCreatedPublisherService } from './order-created-publisher.service';
import { Order } from './entities/order.entity';
import { OrderLine } from './entities/order-line.entity';
import { ProcessedEvent } from './entities/processed-event.entity';

export type CheckoutPayload = {
  eventType: 'CheckoutRequested';
  schemaVersion: 1;
  occurredAt: string;
  correlationId: string;
  userId: string;
  cartId: string;
  payload: { productIds: string[]; quantities: number[] };
};

@Injectable()
export class OrderService {
  private readonly log = new Logger(OrderService.name);

  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderLine) private readonly lines: Repository<OrderLine>,
    @InjectRepository(ProcessedEvent)
    private readonly processed: Repository<ProcessedEvent>,
    private readonly dataSource: DataSource,
    private readonly orderCreatedPublisher: OrderCreatedPublisherService,
  ) {}

  async createOrderFromCheckout(body: CheckoutPayload, idempotencyKey: string): Promise<Order> {
    const existing = await this.processed.findOne({ where: { id: idempotencyKey } });
    if (existing?.orderId) {
      const order = await this.orders.findOne({
        where: { id: existing.orderId },
        relations: ['lines'],
      });
      if (order) return order;
    }

    const { productIds, quantities } = body.payload;
    if (productIds.length !== quantities.length) {
      throw new BadRequestException('Invalid payload dimensions');
    }

    let shouldEmitOrderCreated = false;
    const order = await this.dataSource.transaction(async (manager) => {
      const procRepo = manager.getRepository(ProcessedEvent);
      const hit = await procRepo.findOne({ where: { id: idempotencyKey } });
      if (hit?.orderId) {
        const o = await manager.findOne(Order, {
          where: { id: hit.orderId },
          relations: ['lines'],
        });
        if (o) return o;
      }

      const newOrder = manager.create(Order, {
        userId: body.userId,
        cartId: body.cartId,
        correlationId: body.correlationId,
        status: 'confirmed',
      });
      await manager.save(newOrder);

      const lineEntities: OrderLine[] = [];
      for (let i = 0; i < productIds.length; i++) {
        lineEntities.push(
          manager.create(OrderLine, {
            order: newOrder,
            productId: productIds[i],
            quantity: quantities[i],
            priceCents: 0,
          }),
        );
      }
      await manager.save(lineEntities);

      await procRepo.save({
        id: idempotencyKey,
        orderId: newOrder.id,
      });

      this.log.log(`Order ${newOrder.id} created for correlation ${body.correlationId}`);
      ordersCreatedTotal.inc({ result: 'success' });
      shouldEmitOrderCreated = true;
      return manager.findOneOrFail(Order, {
        where: { id: newOrder.id },
        relations: ['lines'],
      });
    });

    if (shouldEmitOrderCreated) {
      try {
        await this.orderCreatedPublisher.publishOrderCreated(order);
      } catch (e) {
        this.log.error(
          `OrderCreated publish failed for order ${order.id}: ${(e as Error).message}`,
        );
      }
    }

    return order;
  }

  async listOrdersForUser(userId: string): Promise<Order[]> {
    return this.orders.find({
      where: { userId },
      relations: ['lines'],
      order: { createdAt: 'DESC' },
    });
  }

  async getOrder(userId: string, orderId: string): Promise<Order | null> {
    return this.orders.findOne({
      where: { id: orderId, userId },
      relations: ['lines'],
    });
  }
}
