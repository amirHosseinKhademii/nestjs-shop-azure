import { Counter, Gauge, Histogram, register } from 'prom-client';

/**
 * Counter incremented in **shop-svc** whenever a checkout payload is published to
 * Kafka, HTTP (order-svc), or Service Bus. Labels: `transport` (`kafka` | `http` |
 * `servicebus` | `auto` on failure before channel is known) and `result`
 * (`success` | `error`). Use for checkout funnel dashboards and alerts.
 */
export const checkoutPublishedTotal = new Counter({
  name: 'checkout_published_total',
  help: 'Checkout events published from shop-svc',
  labelNames: ['transport', 'result'],
  registers: [register],
});

/**
 * Counter incremented in **order-svc** when an order row is successfully created
 * from a checkout payload inside the idempotent transaction. Label `result` is
 * reserved for future error-path classification; today only `success` is emitted.
 */
export const ordersCreatedTotal = new Counter({
  name: 'orders_created_total',
  help: 'Orders created from checkout in order-svc',
  labelNames: ['result'],
  registers: [register],
});

/**
 * Histogram of wall-clock time spent handling **one checkout message** in order-svc
 * (Kafka consumer, Service Bus pump, or internal HTTP). Label `source` distinguishes
 * ingress (`kafka` | `servicebus` | `http`) for SLO panels and saturation analysis.
 */
export const orderCheckoutHandleSeconds = new Histogram({
  name: 'order_checkout_handle_seconds',
  help: 'Seconds spent handling one checkout message in order-svc',
  labelNames: ['source'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/**
 * Gauge updated in the **Kafka checkout listener** to the approximate lag in seconds
 * between the broker message timestamp and processing start. This is not a full
 * consumer-group lag (no partition high-water offset math); it approximates “how old
 * was the message when we started handling it,” which still correlates with backlog.
 */
export const kafkaConsumerLagSeconds = new Gauge({
  name: 'kafka_consumer_lag_seconds',
  help: 'Approximate lag in seconds for checkout Kafka messages at processing start',
  registers: [register],
});
