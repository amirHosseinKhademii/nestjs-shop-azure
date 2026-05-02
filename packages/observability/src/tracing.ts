import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

/**
 * Process-wide singleton guard so `registerTracing` is idempotent across hot reloads
 * and accidental double registration in tests.
 */
const g = globalThis as typeof globalThis & { __shopOtelSdk?: NodeSDK };

/**
 * Starts the OpenTelemetry `NodeSDK` with OTLP/HTTP trace export when an endpoint
 * is configured. Intended to be called once per process from each service’s `main.ts`
 * before the Nest application boots so auto-instrumentation can wrap HTTP, GraphQL,
 * and other libraries early.
 *
 * **When tracing runs**
 * - Reads `OTEL_EXPORTER_OTLP_ENDPOINT` (base URL, no `/v1/traces` suffix). If unset,
 *   tracing is disabled (no exporter, no SDK).
 * - If `OBS_ENABLED=true` but the endpoint is missing, logs a warning so misconfigured
 *   Kubernetes manifests are obvious in pod logs.
 *
 * **Resource attributes**
 * - `service.name` from `OTEL_SERVICE_NAME` or the `serviceName` argument.
 * - `service.version` from `npm_package_version`, `SERVICE_VERSION`, or `0.0.0`.
 * - `k8s.pod.name` when `POD_NAME` or `HOSTNAME` is set (downward API recommended).
 *
 * **Sampling**
 * - Not configured here on purpose. Use standard OTel env vars, for example:
 *   `OTEL_TRACES_SAMPLER=parentbased_traceidratio` and `OTEL_TRACES_SAMPLER_ARG=0.1`
 *   so head-based sampling applies before spans leave the process (complements tail
 *   sampling in Grafana Alloy / Tempo).
 *
 * **Instrumentation**
 * - Enables `@opentelemetry/auto-instrumentations-node` with filesystem instrumentation
 *   disabled to reduce noise and overhead.
 *
 * @param serviceName - Default logical name for `service.name` if `OTEL_SERVICE_NAME` is unset.
 */
export function registerTracing(serviceName: string): void {
  if (g.__shopOtelSdk) return;

  const obsEnabled = process.env.OBS_ENABLED === 'true';
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) {
    if (obsEnabled) {
      // eslint-disable-next-line no-console
      console.warn(
        `[observability] OBS_ENABLED=true but OTEL_EXPORTER_OTLP_ENDPOINT is missing — tracing disabled for ${serviceName}`,
      );
    }
    return;
  }

  const version = process.env.npm_package_version ?? process.env.SERVICE_VERSION ?? '0.0.0';
  const podName = process.env.POD_NAME ?? process.env.HOSTNAME;

  const traceExporter = new OTLPTraceExporter({
    url: `${endpoint.replace(/\/$/, '')}/v1/traces`,
  });

  const sdk = new NodeSDK({
    traceExporter,
    resource: new Resource({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? serviceName,
      [ATTR_SERVICE_VERSION]: version,
      ...(podName ? { 'k8s.pod.name': podName } : {}),
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
  g.__shopOtelSdk = sdk;
}
