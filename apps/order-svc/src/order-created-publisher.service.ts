import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Producer } from 'kafkajs';
import { buildKafkaClient } from '@shop/shared';
import { Order } from './entities/order.entity';
import type { OrderCreatedPayload } from './order-events.types';

/**
 * Publishes `OrderCreated` to Kafka so downstream services (e.g. `task-svc`
 * for delivery tasks) can react without polling the order database.
 *
 * No-ops when `KAFKA_BROKERS` is unset or `KAFKA_PUBLISH_ORDER_EVENTS=false`.
 * A publish failure is logged but does not fail the order transaction — the
 * order is already committed; ops can re-drive from the DB or DLQ in prod.
 */
@Injectable()
export class OrderCreatedPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OrderCreatedPublisherService.name);
  private producer?: Producer;
  private ready = false;

  constructor() {
    const kafka = buildKafkaClient('order-svc-order-events');
    if (kafka) {
      this.producer = kafka.producer({ allowAutoTopicCreation: false });
    }
  }

  async onModuleInit() {
    const brokers = process.env.KAFKA_BROKERS;
    const disabled = process.env.KAFKA_PUBLISH_ORDER_EVENTS === 'false';
    if (!brokers || disabled || !this.producer) {
      this.log.log(
        brokers && disabled
          ? 'OrderCreated Kafka publisher disabled (KAFKA_PUBLISH_ORDER_EVENTS=false)'
          : !brokers
            ? 'OrderCreated Kafka publisher inactive (no KAFKA_BROKERS)'
            : 'OrderCreated Kafka publisher inactive',
      );
      return;
    }
    try {
      await this.producer.connect();
      this.ready = true;
      const topic = process.env.KAFKA_ORDER_EVENTS_TOPIC ?? 'order-events';
      this.log.log(`OrderCreated Kafka publisher connected → topic "${topic}"`);
    } catch (e) {
      this.log.error(`OrderCreated Kafka producer connect failed: ${(e as Error).message}`);
    }
  }

  async publishOrderCreated(order: Order): Promise<void> {
    if (!this.ready || !this.producer) return;

    const topic = process.env.KAFKA_ORDER_EVENTS_TOPIC ?? 'order-events';
    const occurredAt = new Date().toISOString();
    const body: OrderCreatedPayload = {
      eventType: 'OrderCreated',
      schemaVersion: 1,
      occurredAt,
      orderId: order.id,
      userId: order.userId,
      cartId: order.cartId,
      correlationId: order.correlationId,
      lineCount: order.lines?.length ?? 0,
    };

    await this.producer.send({
      topic,
      messages: [
        {
          key: order.id,
          value: JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
        },
      ],
    });
    this.log.log(`Published OrderCreated ${order.id} to Kafka (${topic})`);
  }

  async onModuleDestroy() {
    if (!this.producer) return;
    try {
      await this.producer.disconnect();
    } catch (e) {
      this.log.error(`OrderCreated Kafka disconnect: ${(e as Error).message}`);
    }
  }
}
