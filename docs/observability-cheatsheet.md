# Observability cheat sheet — infra to code in one page

A reference card for the **Grafana Cloud + Alloy + NestJS** stack already wired into this repo. Use this when you want to *do* something. For *why* it's built this way, read [`observability-roadmap.md`](./observability-roadmap.md). For Alloy operator commands, see [`infra/k8s/observability/README.md`](../infra/k8s/observability/README.md).

---

## 1. The ecosystem at a glance

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Grafana Cloud (SaaS)                           │
│   Mimir (metrics)     Loki (logs)     Tempo (traces)     Faro (RUM)  │
└────────────▲──────────────▲───────────────▲────────────────▲─────────┘
             │ remote_write │ push          │ OTLP HTTP      │ HTTPS
             │              │               │                │ from browser
┌────────────┴──────────────┴───────────────┴────────────────┼─────────┐
│      Grafana Alloy DaemonSet (namespace: observability)    │         │
│  scrape /metrics │ tail pods/log │ OTLP :4317 :4318 + tail │         │
│   (every 30s)    │ (k8s API)     │  sampling 10% + errors  │         │
└──────▲────────────▲─────────────────▲──────────────────────┼─────────┘
       │ HTTP       │ stdout JSON     │ OTLP HTTP            │
┌──────┴────────────┴─────────────────┴──────────────────────┼─────────┐
│                Namespace shop (your apps)                  │         │
│  api-gateway · user-svc · shop-svc · order-svc · payment-svc         │
│  ─ ObservabilityModule.forRoot() → /metrics                          │
│  ─ pino JSON to stdout                                               │
│  ─ registerTracing() in main.ts → OTLP exporter                      │
│                                                                      │
│  web (SPA)  ─ Faro SDK ── reads /config.json (collector URL) ────────┘
└──────────────────────────────────────────────────────────────────────┘
```

**One agent (Alloy), three signals (LGT), one cloud (Grafana).**

---

## 2. Data flow per signal — file by file

Trace each signal from the line of code that emits it to the Grafana Cloud query that reads it back.

| Signal | 1. Emitted by | 2. Exposed/Sent on | 3. Discovered by | 4. Forwarded by | 5. Stored in | 6. Queried as |
|---|---|---|---|---|---|---|
| **HTTP latency / errors** | `HttpMetricsInterceptor` (`packages/observability/src/http-metrics.interceptor.ts`) | `GET /metrics` on each pod (port 3001/3002/…) | Alloy `discovery.kubernetes` + `prometheus.io/scrape` annotations on the Deployment | Alloy `prometheus.scrape` → `prometheus.remote_write "mimir"` (`alloy-config.yaml:69-73`) | **Mimir** | `shop_http_request_duration_seconds` |
| **Business metrics** | `business-metrics.ts` (`Counter`, `Histogram` from `prom-client`) | Same `/metrics` endpoint | Same scrape | Same `remote_write` | **Mimir** | `orders_created_total`, `checkout_published_total`, … |
| **Node / host metrics** | `prometheus.exporter.unix` inside Alloy itself | Internal (Alloy's own `/metrics`) | Self-scrape (`alloy-config.yaml:76-87`) | Same `remote_write` | **Mimir** | `node_load1`, `node_filesystem_avail_bytes`, … |
| **App logs** | `pino` JSON to `stdout` (configured via `ObservabilityModule.forRoot` when `LOG_FORMAT=json`) | Container stdout → kubelet log files | Alloy `loki.source.kubernetes` via the **K8s API** (needs `pods/log` RBAC) | `discovery.relabel "shop_log_targets"` promotes meta-labels → `loki.write "grafana"` (`alloy-config.yaml:93-131`) | **Loki** | `{namespace="shop", app="shop-svc"} \| json \| level >= 40` |
| **Traces (server)** | `registerTracing(name)` in `apps/*/src/main.ts` (auto-instruments HTTP, Mongoose, Kafka, pg, ioredis…) | `OTLP HTTP` POST → `http://alloy.observability.svc.cluster.local:4318/v1/traces` | Alloy `otelcol.receiver.otlp` `:4317`/`:4318` | `tail_sampling` (10% + all errors) → `otelcol.exporter.otlphttp "tempo"` (`alloy-config.yaml:134-183`) | **Tempo** | Explore → Tempo → Search → service `shop-svc` |
| **Browser RUM** | Faro SDK in `apps/web/src/main.ts` | Fetches `/config.json` for collector URL → posts directly to Grafana Cloud | — (browser → cloud, bypasses cluster) | — | **Faro** | Explore → Faro |

---

## 3. The files you'll edit (full map)

| Layer | Path | What it does |
|---|---|---|
| **Code (shared)** | `packages/observability/src/observability.module.ts` | `ObservabilityModule.forRoot({ serviceName })` — Prometheus + pino + interceptor |
| | `packages/observability/src/tracing.ts` | `registerTracing(name)` — OTLP SDK bootstrap |
| | `packages/observability/src/http-metrics.interceptor.ts` | RED histogram per HTTP route |
| | `packages/observability/src/business-metrics.ts` | All custom counters / histograms (cardinality-bounded) |
| | `packages/observability/src/correlation-id.middleware.ts` | `X-Correlation-Id` propagation (Loki ↔ Tempo deep-link) |
| **Code (per app)** | `apps/<svc>/src/main.ts` | `registerTracing('<svc>')` **before** `NestFactory.create` |
| | `apps/<svc>/src/app.module.ts` | `ObservabilityModule.forRoot({ serviceName: '<svc>' })` |
| **K8s manifests** | `infra/k8s/<svc>.yaml` | `prometheus.io/scrape`, `port`, `path` annotations on the Pod template |
| **Agent config** | `infra/k8s/observability/alloy-config.yaml` | River pipeline (discovery → scrape → relabel → remote_write) |
| | `infra/k8s/observability/alloy.yaml` | DaemonSet + ServiceAccount + ClusterRole (incl. `pods/log`) |
| | `infra/k8s/observability/secrets.example.yaml` | Template; real Secret seeded by `seed-secrets.mjs` (local) or `cd.yml` (cloud) |
| **Local secrets** | `.env` (root) | 9 Grafana Cloud env vars (Mimir/Loki/Tempo URLs, users, token) |
| | `infra/local/minikube-overlay/seed-secrets.mjs` | Reads `.env` → creates `grafana-cloud-credentials` Secret |
| **CI secrets** | `.github/workflows/cd.yml` (`seed-secrets-aks`, `seed-secrets-eks`) | Reads GitHub Secrets → same `kubectl create secret` |
| **Dashboards / alerts** | `infra/grafana/dashboards/*.json` | Importable Grafana JSON |
| | `infra/grafana/alerts.yaml` | PromQL/LogQL rule groups |

---

## 4. From zero to data flowing — the 6-command minimum

Assumes Minikube is running and you've populated `.env` with the 9 Grafana Cloud values (see [`grafana-cloud-bootstrap.md`](./grafana-cloud-bootstrap.md) or roadmap Phase 3).

```bash
kubectl apply -f infra/k8s/observability/namespace.yaml

node infra/local/minikube-overlay/seed-secrets.mjs

kubectl apply -k infra/local/minikube-overlay/

kubectl -n observability rollout status daemonset/alloy --timeout=180s

kubectl -n observability logs -l app=alloy --tail=200 \
  | grep -iE 'error|401|403|429|forbidden|dial' || echo "(clean)"

kubectl -n shop port-forward svc/api-gateway 3001:3000 \
  && curl -s localhost:3001/metrics | head -20
```

If the last command prints `# HELP nodejs_…` lines and the grep is `(clean)`, you're done — open `https://<your-org>.grafana.net` → Explore → run `up{job="prometheus.scrape.shop_services"} == 1`.

---

## 5. Add observability to a brand-new service (4 steps)

```ts
// 1. apps/new-svc/src/main.ts — FIRST thing in bootstrap
import { registerTracing } from '@shop/observability';
registerTracing('new-svc');

// 2. apps/new-svc/src/app.module.ts
import { ObservabilityModule } from '@shop/observability';

@Module({
  imports: [ObservabilityModule.forRoot({ serviceName: 'new-svc' }), /* … */],
})
export class AppModule {}
```

```yaml
# 3. infra/k8s/new-svc.yaml — Pod template annotations
spec:
  template:
    metadata:
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port:   "3000"
        prometheus.io/path:   "/metrics"
      labels:
        app: new-svc                 # promoted to a Loki label
```

```bash
# 4. Roll it out
kubectl apply -k infra/local/minikube-overlay/
kubectl -n shop rollout status deploy/new-svc
```

You do **not** need to touch Alloy. Discovery + relabel rules already pick up any pod in `shop` that carries the annotations.

---

## 6. Add a custom metric / log field / trace span

### Custom metric (counter or histogram)

```ts
// 1. packages/observability/src/business-metrics.ts
import { Counter, register } from 'prom-client';

export const newThingTotal = new Counter({
  name: 'new_thing_total',
  help: 'Number of things',
  labelNames: ['result'],   // BOUNDED — never userId, orderId, raw URL
  registers: [register],
});

// 2. packages/observability/src/index.ts — re-export
export { newThingTotal } from './business-metrics';

// 3. In any service
import { newThingTotal } from '@shop/observability';
newThingTotal.inc({ result: 'ok' });
```

Rebuild the package, rebuild affected apps, redeploy. Within 30 s the new series appears in Mimir.

### Structured log field

Pino is already wired. Just call the injected logger with an object:

```ts
this.logger.warn({ orderId, attempts, reason: 'timeout' }, 'order retry exhausted');
```

In Loki: `{namespace="shop", app="order-svc"} | json | reason="timeout"`.

### Custom trace span

```ts
import { trace } from '@opentelemetry/api';
const tracer = trace.getTracer('shop-svc');

await tracer.startActiveSpan('checkout.persist', async (span) => {
  span.setAttribute('order.id', orderId);   // attributes are fine; high-card OK on traces
  try { /* … */ }
  catch (e) { span.recordException(e); span.setStatus({ code: 2 }); throw e; }
  finally { span.end(); }
});
```

The span shows up in Tempo as a child of the incoming HTTP span automatically.

---

## 7. Daily operator commands

```bash
kubectl -n observability get pods,daemonset,svc,cm,secret -l app=alloy

kubectl -n observability logs -l app=alloy -f --tail=100

kubectl -n observability logs -l app=alloy --tail=500 \
  | grep -iE 'error|401|403|429|forbidden|dial|refused|timeout'

kubectl -n observability rollout restart daemonset/alloy   # picks up CM/Secret edits
kubectl -n observability rollout status  daemonset/alloy --timeout=120s

kubectl -n observability port-forward daemonset/alloy 12345:12345
open http://localhost:12345                                # Alloy's own UI

kubectl -n observability get cm alloy-config -o jsonpath='{.data.config\.alloy}' > /tmp/c.alloy
docker run --rm -v /tmp/c.alloy:/etc/alloy/config.alloy:ro \
  docker.io/grafana/alloy:v1.7.5 fmt /etc/alloy/config.alloy   # validate River syntax

kubectl -n observability port-forward svc/alloy 4318:4318      # send a test trace
curl -i -X POST http://localhost:4318/v1/traces \
  -H 'Content-Type: application/json' \
  -d '{"resourceSpans":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"smoketest"}}]},"scopeSpans":[{"spans":[{"traceId":"5b8aa5a2d2c872e8321cf37308d69df2","spanId":"051581bf3cb55c13","name":"hello","kind":1,"startTimeUnixNano":"1719859200000000000","endTimeUnixNano":"1719859201000000000"}]}]}]}'
```

For the full Alloy operator command set (config validation, image pre-pull, secret rotation, teardown) see [`infra/k8s/observability/README.md`](../infra/k8s/observability/README.md).

---

## 8. Verify each layer in Grafana Cloud

Open `https://<your-org>.grafana.net` → **Explore**. Switch the data source dropdown for each query.

```promql
# Mimir — are scrapes succeeding?
up{job="prometheus.scrape.shop_services"} == 1

# Mimir — RPS per route + status
sum by (route, status_code) (rate(shop_http_request_duration_seconds_count[1m]))

# Mimir — p95 latency per route
histogram_quantile(0.95,
  sum by (le, route) (rate(shop_http_request_duration_seconds_bucket[5m])))

# Mimir — error rate (5xx / total)
sum(rate(shop_http_request_duration_seconds_count{status_code=~"5.."}[5m]))
  / sum(rate(shop_http_request_duration_seconds_count[5m]))
```

```logql
# Loki — anything from the shop namespace
{namespace="shop"}

# Loki — warnings + errors only, by app
{namespace="shop", app="shop-svc"} | json | level >= 40

# Loki — log volume per app
sum by (app) (count_over_time({namespace="shop"}[5m]))
```

```
# Tempo — Explore → Tempo → Search tab (NOT Code)
Service Name: shop-svc
Status:       (blank | Error)
→ click any trace row → see the flame chart
```

To **deep-link from a log line to its trace**: open a Loki line, expand JSON, click the `trace_id` value — Grafana auto-renders a "Tempo" link via derived fields (configured because we propagate `X-Correlation-Id`).

---

## 9. Top errors → 1-line fix

| You see this | Fix |
|---|---|
| `daemonsets.apps "alloy" not found` | `kubectl apply -k infra/local/minikube-overlay/` |
| `component "__name__" does not exist or is out of scope` | River requires quoted labels: `source_labels = ["__name__"]` (not bare) |
| `component "otelcol.auth.tempo_auth.handler" does not exist` | Use `otelcol.auth.basic.tempo_auth.handler` (include `.basic`) |
| `pods "<name>" is forbidden: cannot get resource "pods/log"` | Add `{ resources: [pods/log], verbs: [get,list,watch] }` to ClusterRole `alloy` |
| `{namespace="shop"}` returns "No logs found" but `loki_write_request_duration_seconds_count` is increasing | Add `discovery.relabel "shop_log_targets"` to promote `__meta_kubernetes_namespace` → `namespace` |
| Tempo `HTTP 401 Unauthenticated` against `otlp-gateway-prod-*.grafana.net` | `TEMPO_USER` must be the **stack instance ID**, not the Tempo tenant ID — re-seed Secret + restart |
| Mimir/Loki `HTTP 401` | Token missing the `set:alloy-data-write` Access Policy scope |
| `up{…} == 0` and `/metrics` returns `404` | Image was built **before** `ObservabilityModule` was wired in — rebuild + `kubectl set image` |
| TS error `… can only be default-imported using the 'esModuleInterop' flag` | Add `"esModuleInterop": true` + `"allowSyntheticDefaultImports": true` to `packages/observability/tsconfig.json` |
| Pod `CrashLoopBackOff` immediately on start | Almost always a River parse error — `kubectl -n observability logs -l app=alloy --previous` shows the line number |

---

## 10. Where things live in the cloud

| Backend | Where to find URL + user | Auth user is | Scope on token |
|---|---|---|---|
| **Mimir** | `grafana.com` → My Account → Stack → **Stack Details → Hosted Prometheus** | Numeric Mimir user ID | `metrics:write` |
| **Loki** | Same panel → **Loki** | Numeric Loki user ID | `logs:write` |
| **Tempo (writes)** | Same panel → **Tempo → OTLP gateway** | **Stack instance ID** (NOT Tempo tenant ID) — this trip-up cost an hour | `traces:write` |
| **Tempo (queries / Grafana data source)** | Same panel → **Tempo → Native URL** | Numeric Tempo tenant ID | `traces:read` |
| **Faro** | `grafana.com` → Frontend Observability → app → Web SDK config | App key | (set on app) |
| **All three writes via one token** | Access Policies → enable `set:alloy-data-write` | (per-backend, as above) | Covers all three `*:write` scopes |

---

## 11. Production / cloud deploy (AKS + EKS)

The local recipe is identical; only the Secret-seeding path changes.

| Step | Local Minikube | AKS / EKS |
|---|---|---|
| Seed `grafana-cloud-credentials` | `node infra/local/minikube-overlay/seed-secrets.mjs` (reads `.env`) | `seed-secrets-aks` / `seed-secrets-eks` job in `.github/workflows/cd.yml` (reads GitHub Secrets) |
| Apply manifests | `kubectl apply -k infra/local/minikube-overlay/` | `kubectl apply -k infra/azure/aks-overlay/` or `infra/aws/eks-overlay/` |
| Verify | `kubectl rollout status …` locally | The CD job's `kubectl rollout status` step + the Job Summary URL |

Provision the cluster first via Terraform — see [`infra/terraform/aws/README.md`](../infra/terraform/aws/README.md) for EKS, [`infra/azure/aks-overlay/azure-guide.md`](../infra/azure/aks-overlay/azure-guide.md) for AKS.

---

## 12. Where to go next

- **Why it's built this way** → [`observability-roadmap.md`](./observability-roadmap.md)
- **Architecture + label conventions** → [`observability.md`](./observability.md)
- **Grafana Cloud bootstrap walkthrough** → [`grafana-cloud-bootstrap.md`](./grafana-cloud-bootstrap.md)
- **Alloy operator deep-dive** → [`infra/k8s/observability/README.md`](../infra/k8s/observability/README.md)
- **Add a dashboard** → drop JSON under `infra/grafana/dashboards/`, import via Grafana UI
- **Add an alert** → append a rule to `infra/grafana/alerts.yaml`, paste into Grafana → Alerting → Import
