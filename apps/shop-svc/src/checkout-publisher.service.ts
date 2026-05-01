import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ServiceBusClient } from '@azure/service-bus';
import { firstValueFrom } from 'rxjs';

export type CheckoutBody = {
  eventType: 'CheckoutRequested';
  schemaVersion: 1;
  occurredAt: string;
  correlationId: string;
  userId: string;
  cartId: string;
  payload: { productIds: string[]; quantities: number[] };
};

@Injectable()
export class CheckoutPublisherService implements OnModuleDestroy {
  private readonly log = new Logger(CheckoutPublisherService.name);
  private sb?: ServiceBusClient;

  constructor(private readonly http: HttpService) {
    const conn = process.env.SERVICEBUS_CONNECTION_STRING;
    if (conn) this.sb = new ServiceBusClient(conn);
  }

  async publishCheckout(body: CheckoutBody) {
    const transport = process.env.CHECKOUT_TRANSPORT ?? 'auto';

    if (transport === 'http') {
      await this.forwardHttp(body);
      return { channel: 'http' as const };
    }

    if (transport === 'servicebus') {
      if (!this.sb) throw new Error('SERVICEBUS_CONNECTION_STRING required');
      await this.forwardBus(body);
      return { channel: 'servicebus' as const };
    }

    // auto
    if (this.sb) {
      await this.forwardBus(body);
      return { channel: 'servicebus' as const };
    }
    await this.forwardHttp(body);
    return { channel: 'http' as const };
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
    const key = process.env.INTERNAL_API_KEY ?? 'dev-internal-key';
    await firstValueFrom(
      this.http.post(`${orderUrl}/internal/checkout`, body, {
        headers: { 'x-internal-key': key },
      }),
    );
    this.log.log(`Forwarded CheckoutRequested ${body.correlationId} via HTTP`);
  }

  onModuleDestroy() {
    return this.sb?.close();
  }
}
