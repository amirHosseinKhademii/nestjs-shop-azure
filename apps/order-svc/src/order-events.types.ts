/**
 * Emitted to `KAFKA_ORDER_EVENTS_TOPIC` (default: `order-events`) after a new
 * order is persisted. Consumed by `task-svc` to create a delivery work item.
 *
 * The task id in Postgres is the same uuid as `orderId` for idempotency
 * (duplicate events are a no-op at the database level).
 */
export type OrderCreatedPayload = {
  eventType: 'OrderCreated';
  schemaVersion: 1;
  occurredAt: string;
  orderId: string;
  userId: string;
  cartId: string;
  correlationId: string;
  lineCount: number;
};
