import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ServiceBusClient } from '@azure/service-bus';
import type { Producer } from 'kafkajs';
import { firstValueFrom } from 'rxjs';
import { checkoutPublishedTotal } from '@shop/observability';
import { buildKafkaClient } from '@shop/shared';

export type CheckoutBody = {
  eventType: 'CheckoutRequested';
  schemaVersion: 1;
  occurredAt: string;
  correlationId: string;
  userId: string;
  cartId: string;
  payload: { productIds: string[]; quantities: number[] };
};

type Transport = 'auto' | 'http' | 'servicebus' | 'kafka';

@Injectable()
export class CheckoutPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CheckoutPublisherService.name);
  private sb?: ServiceBusClient;
  private kafkaProducer?: Producer;
  private kafkaReady = false;

  constructor(private readonly http: HttpService) {
    const sbConn = process.env.SERVICEBUS_CONNECTION_STRING;
    if (sbConn) this.sb = new ServiceBusClient(sbConn);

    const kafka = buildKafkaClient('shop-svc');
    if (kafka) this.kafkaProducer = kafka.producer({ allowAutoTopicCreation: false });
  }

  async onModuleInit() {
    if (!this.kafkaProducer) return;
    try {
      await this.kafkaProducer.connect();
      this.kafkaReady = true;
      this.log.log('Kafka producer connected');
    } catch (e) {
      // Don't crash the pod — fall back to Service Bus / HTTP per `auto` rules.
      this.log.error(`Kafka producer connect failed: ${(e as Error).message}`);
    }
  }

  async publishCheckout(body: CheckoutBody) {
    const transport = (process.env.CHECKOUT_TRANSPORT ?? 'auto') as Transport;

    try {
      if (transport === 'http') {
        await this.forwardHttp(body);
        checkoutPublishedTotal.inc({ transport: 'http', result: 'success' });
        return { channel: 'http' as const };
      }

      if (transport === 'servicebus') {
        if (!this.sb) throw new Error('SERVICEBUS_CONNECTION_STRING required');
        await this.forwardBus(body);
        checkoutPublishedTotal.inc({ transport: 'servicebus', result: 'success' });
        return { channel: 'servicebus' as const };
      }

      if (transport === 'kafka') {
        if (!this.kafkaProducer) throw new Error('KAFKA_BROKERS required');
        await this.forwardKafka(body);
        checkoutPublishedTotal.inc({ transport: 'kafka', result: 'success' });
        return { channel: 'kafka' as const };
      }

      // auto: prefer Kafka, then Service Bus, then HTTP fallback.
      if (this.kafkaReady) {
        await this.forwardKafka(body);
        checkoutPublishedTotal.inc({ transport: 'kafka', result: 'success' });
        return { channel: 'kafka' as const };
      }
      if (this.sb) {
        await this.forwardBus(body);
        checkoutPublishedTotal.inc({ transport: 'servicebus', result: 'success' });
        return { channel: 'servicebus' as const };
      }
      await this.forwardHttp(body);
      checkoutPublishedTotal.inc({ transport: 'http', result: 'success' });
      return { channel: 'http' as const };
    } catch (e) {
      checkoutPublishedTotal.inc({
        transport: transport === 'auto' ? 'auto' : transport,
        result: 'error',
      });
      throw e;
    }
  }

  private async forwardKafka(body: CheckoutBody) {
    const topic = process.env.KAFKA_TOPIC ?? 'checkout-events';
    await this.kafkaProducer!.send({
      topic,
      messages: [
        {
          key: body.correlationId,
          value: JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
        },
      ],
    });
    this.log.log(`Published CheckoutRequested ${body.correlationId} to Kafka (${topic})`);
  }

  private async forwardBus(body: CheckoutBody) {
    const topic = process.env.SERVICEBUS_TOPIC ?? 'checkout-events';
    const sender = this.sb!.createSender(topic);
    try {
      await sender.sendMessages({ body, contentType: 'application/json' });
      this.log.log(`Published CheckoutRequested ${body.correlationId} to Service Bus`);
    } finally {
      await sender.close();
    }
  }

  private async forwardHttp(body: CheckoutBody) {
    const orderUrl = process.env.ORDER_SVC_URL ?? 'http://localhost:3003';
    await firstValueFrom(
      this.http.post(`${orderUrl}/internal/checkout`, body, {
        headers: { 'x-correlation-id': body.correlationId },
      }),
    );
    this.log.log(`Forwarded CheckoutRequested ${body.correlationId} via HTTP`);
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.sb?.close(), this.kafkaProducer?.disconnect()]);
  }
}
