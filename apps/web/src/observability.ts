import {
  createReactRouterV7DataOptions,
  getWebInstrumentations,
  initializeFaro,
  ReactIntegration,
} from '@grafana/faro-react';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';
import { matchRoutes } from 'react-router-dom';

/** Runtime JSON served as `/config.json` (nginx: no-store; K8s: ConfigMap mount). */
export type WebRuntimeConfig = {
  /** When false, Faro is not started even if a collector URL is present. */
  faroEnabled?: boolean;
  /** Grafana Cloud Frontend Observability collector URL (includes app id path when required). */
  faroCollectorUrl?: string;
  /** Public app key if your stack sends it separately from the URL (optional). */
  faroAppKey?: string;
  /** Shown as `app.name` in Faro / Tempo. */
  faroAppName?: string;
};

let faroBootstrapped = false;

/**
 * Fetch `/config.json` then start Faro (RUM + fetch trace context) when enabled.
 * Safe to call multiple times; initializes at most once.
 */
export async function bootstrapObservability(): Promise<void> {
  if (faroBootstrapped) return;
  faroBootstrapped = true;

  let cfg: WebRuntimeConfig = {};
  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    if (res.ok) cfg = (await res.json()) as WebRuntimeConfig;
  } catch {
    /* offline / no config — skip Faro */
  }

  if (cfg.faroEnabled === false || !cfg.faroCollectorUrl?.trim()) {
    return;
  }

  initializeFaro({
    url: cfg.faroCollectorUrl.trim(),
    ...(cfg.faroAppKey?.trim() ? { apiKey: cfg.faroAppKey.trim() } : {}),
    app: {
      name: cfg.faroAppName?.trim() || 'shop-web',
      version: import.meta.env.VITE_APP_VERSION ?? '0.0.1',
    },
    instrumentations: [
      ...getWebInstrumentations(),
      new TracingInstrumentation(),
      new ReactIntegration({
        router: createReactRouterV7DataOptions({ matchRoutes }),
      }),
    ],
  });
}
