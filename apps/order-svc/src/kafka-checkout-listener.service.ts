import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Consumer } from 'kafkajs';
import { buildKafkaClient } from '@shop/shared';
import { OrderService } from './order.service';
import type { CheckoutPayload } from './order.service';

// Twin of ServiceBusListenerService for the Kafka transport. Auto-enables when
// KAFKA_BROKERS is set unless KAFKA_LISTENER_ENABLED=false is passed
// explicitly. Idempotency is handled by OrderService via the message key
// (correlationId) so re-delivery on partition rebalance is safe.
@Injectable()
export class KafkaCheckoutListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(KafkaCheckoutListenerService.name);
  private consumer?: Consumer;

  constructor(private readonly orders: OrderService) {}

  async onModuleInit() {
    const brokers = process.env.KAFKA_BROKERS;
    const explicit = process.env.KAFKA_LISTENER_ENABLED;
    const enabled = explicit === undefined ? Boolean(brokers) : explicit !== 'false';
    if (!brokers || !enabled) {
      this.log.warn('Kafka listener disabled (no KAFKA_BROKERS or KAFKA_LISTENER_ENABLED=false)');
      return;
    }

    const kafka = buildKafkaClient('order-svc');
    if (!kafka) return;

    const topic = process.env.KAFKA_TOPIC ?? 'checkout-events';
    const groupId = process.env.KAFKA_GROUP_ID ?? 'order-svc';

    this.consumer = kafka.consumer({ groupId });

    try {
      await this.consumer.connect();
      await this.consumer.subscribe({ topic, fromBeginning: false });
    } catch (e) {
      this.log.error(`Kafka consumer connect failed: ${(e as Error).message}`);
      this.consumer = undefined;
      return;
    }

    void this.consumer.run({
      eachMessage: async ({ message }) => {
        const raw = message.value?.toString('utf8');
        if (!raw) return;

        let body: CheckoutPayload;
        try {
          body = JSON.parse(raw) as CheckoutPayload;
        } catch (e) {
          this.log.error(`Invalid JSON, skipping: ${(e as Error).message}`);
          return;
        }

        const key = message.key?.toString('utf8') ?? body.correlationId ?? raw.slice(0, 120);

        try {
          await this.orders.createOrderFromCheckout(body, key);
        } catch (e) {
          // Re-throw so kafkajs commits the offset only on success and retries
          // per its consumer retry config; persistent failures will block the
          // partition until ops intervene (matches Service Bus DLQ behaviour
          // semantically — Aiven also supports DLQ via a separate topic).
          this.log.error(`Failed processing message ${key}: ${(e as Error).message}`);
          throw e;
        }
      },
    });

    this.log.log(`Kafka listener subscribed to ${topic} as group ${groupId}`);
  }

  async onModuleDestroy() {
    if (!this.consumer) return;
    try {
      await this.consumer.disconnect();
    } catch (e) {
      this.log.error(`Kafka disconnect: ${(e as Error).message}`);
    }
  }
}
