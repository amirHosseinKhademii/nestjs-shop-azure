/**
 * `@shop/observability` — shared NestJS + Prometheus + OpenTelemetry + logging primitives.
 *
 * Re-exports the public surface so services only import from this barrel. See
 * `docs/observability.md` for how tracing, metrics, and logs reach Grafana Cloud.
 */
export { ObservabilityModule, type ObservabilityModuleOptions } from './observability.module';
export { registerTracing } from './tracing';
export {
  correlationIdMiddleware,
  type RequestWithCorrelationId,
} from './correlation-id.middleware';
export { HttpMetricsInterceptor, normalizeRoute } from './http-metrics.interceptor';
export {
  checkoutPublishedTotal,
  kafkaConsumerLagSeconds,
  ordersCreatedTotal,
  orderCheckoutHandleSeconds,
} from './business-metrics';
