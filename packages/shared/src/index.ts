/** Checkout event published by shop-svc (Service Bus body). */
export interface CheckoutRequestedPayload {
  eventType: 'CheckoutRequested';
  schemaVersion: 1;
  occurredAt: string;
  correlationId: string;
  userId: string;
  cartId: string;
  payload: {
    productIds: string[];
    quantities: number[];
  };
}

export const CHECKOUT_TOPIC = 'checkout-events';

export { buildPostgresTypeOrmOptions, type BuildPostgresOptions } from './typeorm';
export { resolveServiceEnvFiles } from './env';
