import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ServiceBusClient, ServiceBusReceiver } from '@azure/service-bus';
import { orderCheckoutHandleSeconds } from '@shop/observability';
import { OrderService } from './order.service';
import type { CheckoutPayload } from './order.service';

@Injectable()
export class ServiceBusListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ServiceBusListenerService.name);
  private client?: ServiceBusClient;
  private receiver?: ServiceBusReceiver;
  private closing = false;

  constructor(private readonly orders: OrderService) {}

  onModuleInit() {
    const conn = process.env.SERVICEBUS_CONNECTION_STRING;
    const enabled = process.env.SERVICEBUS_LISTENER_ENABLED !== 'false';
    if (!conn || !enabled) {
      this.log.warn('Service Bus listener disabled (no connection string or disabled)');
      return;
    }

    const topic = process.env.SERVICEBUS_TOPIC ?? 'checkout-events';
    const subscription = process.env.SERVICEBUS_SUBSCRIPTION ?? 'order-svc';

    this.client = new ServiceBusClient(conn);
    this.receiver = this.client.createReceiver(topic, subscription);

    const pump = async () => {
      while (!this.closing && this.receiver) {
        try {
          const messages = await this.receiver.receiveMessages(10, {
            maxWaitTimeInMs: 5000,
          });
          for (const msg of messages) {
            const body = msg.body as CheckoutPayload;
            const key = String(
              msg.messageId ?? body.correlationId ?? JSON.stringify(body).slice(0, 120),
            );
            const endTimer = orderCheckoutHandleSeconds.startTimer({ source: 'servicebus' });
            try {
              await this.orders.createOrderFromCheckout(body, key);
              await this.receiver.completeMessage(msg);
            } catch (e) {
              this.log.error(`Failed processing message: ${(e as Error).message}`);
              await this.receiver.deadLetterMessage(msg, {
                deadLetterReason: 'ProcessingFailed',
                deadLetterErrorDescription: (e as Error).message,
              });
            } finally {
              endTimer();
            }
          }
        } catch (e) {
          if (!this.closing) this.log.error((e as Error).message);
        }
      }
    };

    void pump();
    this.log.log(`Listening on ${topic}/${subscription}`);
  }

  async onModuleDestroy() {
    this.closing = true;
    await this.receiver?.close();
    await this.client?.close();
  }
}
