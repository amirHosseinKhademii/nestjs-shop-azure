import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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

    return this.dataSource.transaction(async (manager) => {
      const procRepo = manager.getRepository(ProcessedEvent);
      const hit = await procRepo.findOne({ where: { id: idempotencyKey } });
      if (hit?.orderId) {
        const o = await manager.findOne(Order, {
          where: { id: hit.orderId },
          relations: ['lines'],
        });
        if (o) return o;
      }

      const order = manager.create(Order, {
        userId: body.userId,
        cartId: body.cartId,
        correlationId: body.correlationId,
        status: 'confirmed',
      });
      await manager.save(order);

      const lineEntities: OrderLine[] = [];
      for (let i = 0; i < productIds.length; i++) {
        lineEntities.push(
          manager.create(OrderLine, {
            order,
            productId: productIds[i],
            quantity: quantities[i],
            priceCents: 0,
          }),
        );
      }
      await manager.save(lineEntities);

      await procRepo.save({
        id: idempotencyKey,
        orderId: order.id,
      });

      this.log.log(`Order ${order.id} created for correlation ${body.correlationId}`);
      return manager.findOneOrFail(Order, {
        where: { id: order.id },
        relations: ['lines'],
      });
    });
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
