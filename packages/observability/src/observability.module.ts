import { DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { LoggerModule } from 'nestjs-pino';
import pino from 'pino';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';

/**
 * Options passed to {@link ObservabilityModule.forRoot}. Keeps the dynamic module
 * API small and explicit so each service registers the same contract with a single
 * `serviceName` value.
 */
export type ObservabilityModuleOptions = {
  /**
   * Logical service name for logs and for `OTEL_SERVICE_NAME` when tracing reads it.
   * Should match the workload name you use in dashboards (e.g. `api-gateway`).
   */
  serviceName: string;
};

/**
 * Global Nest module that wires **Prometheus** (`/metrics`), optional **Pino** HTTP
 * logging, and the **HTTP RED histogram** interceptor for every HTTP controller.
 *
 * Import once in `AppModule`:
 *
 * ```ts
 * ObservabilityModule.forRoot({ serviceName: 'my-svc' })
 * ```
 *
 * **Prometheus**
 * - Registers default process metrics and exposes them on `/metrics` (path is fixed
 *   here so Grafana Alloy can scrape a single convention across all services).
 *
 * **Pino**
 * - Enabled when `LOG_FORMAT=json` **or** `OBS_ENABLED=true`. Uses JSON logs with
 *   redaction for `authorization`, `cookie`, and `password` fields on the request.
 *   Aligns structured logs with Loki ingestion in cluster.
 *
 * **HTTP metrics**
 * - Registers {@link HttpMetricsInterceptor} as `APP_INTERCEPTOR` so every HTTP
 *   route contributes to `shop_http_request_duration_seconds` with bounded `route`
 *   labels via {@link normalizeRoute}.
 */
@Module({})
export class ObservabilityModule {
  /**
   * Builds a {@link DynamicModule} that imports Prometheus (and optionally Pino),
   * registers the global HTTP metrics interceptor, and re-exports providers for
   * consumers that inject `PROM_METRIC_*` or `Logger` from `nestjs-pino`.
   *
   * @param _opts - Currently only `serviceName` is required for API consistency;
   *   reserved for future module-level config (e.g. custom metrics path).
   * @returns A global dynamic module safe to import in `AppModule` exactly once.
   */
  static forRoot(_opts: ObservabilityModuleOptions): DynamicModule {
    const usePino =
      process.env.LOG_FORMAT === 'json' || process.env.OBS_ENABLED === 'true';

    return {
      module: ObservabilityModule,
      global: true,
      imports: [
        PrometheusModule.register({
          path: '/metrics',
          defaultMetrics: { enabled: true },
        }),
        ...(usePino
          ? [
              LoggerModule.forRoot({
                pinoHttp: {
                  logger: pino({
                    level: process.env.LOG_LEVEL ?? 'info',
                    redact: [
                      'req.headers.authorization',
                      'req.headers.cookie',
                      'req.body.password',
                    ],
                  }),
                },
              }),
            ]
          : []),
      ],
      providers: [{ provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor }],
      exports: [PrometheusModule, ...(usePino ? [LoggerModule] : [])],
    };
  }
}
