# Observability roadmap — from zero to a working LGTM stack

End-to-end playbook for adding **Grafana Cloud (Mimir + Loki + Tempo) + Prometheus** to this monorepo. Read once for the conceptual map; come back per phase when wiring a new service or onboarding a teammate.

> Companion docs:
> - [`docs/observability.md`](./observability.md) — architecture, conventions, runbook.
> - [`docs/grafana-cloud-bootstrap.md`](./grafana-cloud-bootstrap.md) — bootstrap quick reference.
> - [`infra/k8s/observability/README.md`](../infra/k8s/observability/README.md) — Alloy-only cheat sheet (kubectl commands + common errors).

---

## Roadmap at a glance

| Phase | What you do | Where it lives |
|-------|------------|----------------|
| 0 | Decide what you want to measure (RED, USE, business KPIs) | This doc, mental model |
| 1 | Add metrics, logs, and traces to the **app code** (NestJS + pino + OTel) | `packages/observability/`, `apps/*/src/` |
| 2 | Annotate **Kubernetes manifests** so a scraper can find them | `infra/k8s/*.yaml` |
| 3 | Create a **Grafana Cloud account** and grab credentials | `grafana.com` UI |
| 4 | Store credentials for **local dev** and **CI/CD** | `.env`, `seed-secrets.mjs`, GitHub Secrets |
| 5 | Deploy **Grafana Alloy** (the LGTM agent) into the cluster | `infra/k8s/observability/` |
| 6 | Apply, watch the pipeline come up, fix any first-run errors | `kubectl apply -k …` |
| 7 | Query the three backends and verify data | Grafana **Explore** |
| 8 | Build **dashboards + alerts** | `infra/grafana/` |
| 9 | Operate it — common pitfalls and how we solved them | This doc, [pitfalls](#9-pitfalls-we-hit-and-how-we-fixed-them) |
| 10 | Replicate on AKS / EKS / production via CI/CD | `.github/workflows/cd.yml`, `infra/azure/`, `infra/aws/` |

---

## 0. The mental model

We collect **three signals** ("the three pillars") plus **alerts**:

| Signal | What it answers | Format | Backend | This repo's choice |
|---|---|---|---|---|
| **Metrics** | "Is the system healthy? How fast? How many errors?" | Time series of numbers (counters, gauges, histograms) | **Mimir** (Prometheus-compatible) | `prom-client` via `@willsoto/nestjs-prometheus`, exposed on `/metrics` |
| **Logs** | "What did the code actually print, in order?" | Free-text or structured JSON lines | **Loki** | `pino` JSON logs to stdout; tailed via the K8s API |
| **Traces** | "How did one request hop through the services? Where did time go?" | DAG of spans (start, end, attributes, parent) | **Tempo** | OpenTelemetry SDK (`@opentelemetry/*`) → OTLP HTTP |
| **Alerts** | "Wake me up when X happens" | PromQL/LogQL rule evaluated server-side | Mimir Ruler / Grafana Alerting | `infra/grafana/alerts.yaml` |

A **single agent** — **Grafana Alloy** — collects all three from Kubernetes and forwards them to Grafana Cloud. One DaemonSet replaces what used to be three pods (node-exporter + Promtail + OTel Collector).

```
                        ┌──────────────────────────────────────────────┐
                        │            Grafana Cloud (SaaS)              │
                        │  ┌────────┐  ┌────────┐  ┌────────┐          │
                        │  │ Mimir  │  │  Loki  │  │ Tempo  │  Faro    │
                        │  └───▲────┘  └───▲────┘  └───▲────┘          │
                        └──────│───────────│───────────│───────────────┘
                               │           │           │
                               │ HTTPS     │ HTTPS     │ OTLP HTTPS
                               │ remote_   │ push      │
                               │ write     │           │
                        ┌──────┴───────────┴───────────┴───────────────┐
                        │      Grafana Alloy (DaemonSet, 1/node)       │
                        │  ┌─────────┐ ┌──────────┐ ┌──────────────┐   │
                        │  │ scrape  │ │ k8s API  │ │ OTLP receiver│   │
                        │  │/metrics │ │ pod tail │ │ :4317 / :4318│   │
                        │  └────▲────┘ └─────▲────┘ └──────▲───────┘   │
                        └───────│────────────│─────────────│───────────┘
                                │            │             │
              ┌─────────────────┼────────────┼─────────────┼───────────┐
              │ Namespace shop  │            │             │           │
              │  ┌──────────────┴─┐ ┌────────┴──────┐ ┌────┴──────┐    │
              │  │ api-gateway    │ │ user-svc      │ │ shop-svc  │ …  │
              │  │  /metrics      │ │  /metrics     │ │  /metrics │    │
              │  │  stdout (json) │ │  stdout (json)│ │  stdout   │    │
              │  │  OTLP client   │ │  OTLP client  │ │  OTLP     │    │
              │  └────────────────┘ └───────────────┘ └───────────┘    │
              └────────────────────────────────────────────────────────┘
```

Why these choices?

- **Grafana Cloud free tier** — 10k active series, 50 GB logs, 50 GB traces. Enough for a portfolio. Self-host later by swapping the URLs in `loki.write` / `prometheus.remote_write` / `otelcol.exporter.otlphttp` (no code changes).
- **Alloy over separate agents** — one binary, one config language (River), shared discovery, less RAM. Replaces `node-exporter + Promtail + OTel Collector + Tempo agent`.
- **OpenTelemetry SDK for traces** (not Jaeger client) — vendor-neutral; the same SDK works with Grafana Tempo, Datadog, New Relic, etc.

---

## 1. Instrument the application

### 1.1 The shared package

Everything observable lives in **`packages/observability/`**. Services consume only `@shop/observability`, never the underlying libraries directly. This keeps versions and conventions in one place.

```ts
// packages/observability/src/index.ts
export { ObservabilityModule } from './observability.module';
export { registerTracing } from './tracing';
export { correlationIdMiddleware } from './correlation-id.middleware';
export { HttpMetricsInterceptor, normalizeRoute } from './http-metrics.interceptor';
export {
  checkoutPublishedTotal,
  kafkaConsumerLagSeconds,
  ordersCreatedTotal,
  orderCheckoutHandleSeconds,
} from './business-metrics';
```

### 1.2 Bringing it into a NestJS app

In each app's `AppModule`, import once:

```ts
import { ObservabilityModule } from '@shop/observability';

@Module({
  imports: [
    ObservabilityModule.forRoot({ serviceName: 'shop-svc' }),
    // … your feature modules
  ],
})
export class AppModule {}
```

`ObservabilityModule.forRoot()` does three things:

1. Registers `@willsoto/nestjs-prometheus`, exposing **`GET /metrics`** with `defaultMetrics: { enabled: true }` (Node event-loop, GC, heap, FDs, plus your custom ones).
2. Wires `HttpMetricsInterceptor` as `APP_INTERCEPTOR`, so every HTTP route emits `shop_http_request_duration_seconds` (`method`, `route`, `status_code`).
3. When `LOG_FORMAT=json` **or** `OBS_ENABLED=true`, registers `nestjs-pino` for structured JSON logs (with `authorization`, `cookie`, `password` redacted).

### 1.3 Tracing (OpenTelemetry)

Bootstrap is a **separate** call, **before Nest starts**, in `main.ts`:

```ts
// apps/shop-svc/src/main.ts
import { registerTracing } from '@shop/observability';

async function bootstrap() {
  registerTracing('shop-svc');                          // must run first
  const app = await NestFactory.create(AppModule);
  // …
  await app.listen(port, '0.0.0.0');
}
```

`registerTracing(serviceName)` (in `packages/observability/src/tracing.ts`) sets up:

- Auto-instrumentations for HTTP, Express, Mongoose, ioredis, kafkajs, pg, etc.
- An OTLP HTTP exporter pointing at `OTEL_EXPORTER_OTLP_ENDPOINT` (defaults to `http://alloy.observability.svc.cluster.local:4318` in cluster).
- Resource attributes: `service.name`, `service.namespace="shop"`, deployment env.
- A parent-based ratio sampler (`OTEL_TRACES_SAMPLER_ARG=0.1` → keep 10% of traces, plus all errors via Alloy tail-sampling).

### 1.4 Custom business metrics

Add new series in `packages/observability/src/business-metrics.ts`, **never** ad hoc in services — this keeps cardinality bounded and labels consistent.

```ts
import { Counter, Histogram, register } from 'prom-client';

export const ordersCreatedTotal = new Counter({
  name: 'orders_created_total',
  help: 'Orders successfully created',
  labelNames: ['result'],          // bounded enum: 'ok' | 'error'
  registers: [register],
});
```

Then in the service that owns the business event:

```ts
import { ordersCreatedTotal } from '@shop/observability';
ordersCreatedTotal.inc({ result: 'ok' });
```

**Cardinality rule of thumb:** label values must be bounded. Never use `userId`, `orderId`, raw URLs, IPs, or timestamps as labels — they create unbounded series and blow your Mimir quota in hours.

### 1.5 Structured logs

With `LOG_FORMAT=json` or `OBS_ENABLED=true`, Pino emits one JSON object per line:

```json
{"level":30,"time":1736023421000,"pid":1,"hostname":"shop-svc-…","req":{"id":"abc","method":"GET","url":"/cart","headers":{…}},"msg":"request completed"}
```

Loki indexes the **labels** (namespace, pod, container, app — see [Phase 5.4](#54-promote-meta-labels-to-indexed-labels)) and stores the JSON line as the body. In Grafana, `{namespace="shop"} | json | level >= 40` lets you slice by any field inside the JSON.

### 1.6 Correlation ID

`correlationIdMiddleware` adds an `X-Correlation-Id` header (generated if missing) and sets it on the Pino logger context, so the same ID appears in:

- The structured log line (`correlationId`)
- The OTLP span (`correlation_id` resource attribute)
- The downstream `Authorization: Bearer …` requests (header propagated)

This is what lets you start in Loki, click a log line, and **jump to the matching trace in Tempo** (Grafana derived field).

---

## 2. Annotate Kubernetes manifests

Alloy's discovery uses **standard `prometheus.io/*` annotations**, the same convention as kube-prometheus-stack. Every backend Deployment in `infra/k8s/*.yaml` has:

```yaml
spec:
  template:
    metadata:
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port:   "3001"
        prometheus.io/path:   "/metrics"
      labels:
        app: user-svc                  # promoted to a Loki label
```

The `web` (SPA) Deployment intentionally **omits** the scrape annotation — there's nothing to scrape from a static nginx serving `index.html`.

The discovery & relabel rules in [`alloy-config.yaml`](../infra/k8s/observability/alloy-config.yaml) translate these annotations into scrape targets. You don't need to touch Alloy when adding a new service — just put the annotations on the Pod template.

---

## 3. Set up Grafana Cloud

### 3.1 Create a stack

1. Sign up at [grafana.com](https://grafana.com) → **Create a Grafana Cloud stack** (free, no credit card).
2. Pick a region (we use `prod-eu-north-0`). Stack URL is `https://<your-org>.grafana.net`.
3. Note your **stack instance ID** (visible in the URL after creation, e.g. `1620963`). You'll need it for the Tempo OTLP gateway later.

### 3.2 Find your endpoints (the part that always trips people up)

There are **two different places** in Grafana Cloud:

| URL | What you find here |
|---|---|
| `grafana.com` (Cloud Portal) | Stack list, **Stack Details**, Access Policies, billing |
| `<your-org>.grafana.net` (Grafana itself) | Dashboards, Explore, Alerting |

**Endpoints + user IDs come from the Cloud Portal**, not from inside Grafana.

1. `grafana.com` → **My Account** → **Stacks** → click your stack name.
2. **Stack Details** lists, for each backend:
   - **Mimir / Hosted Prometheus** — Remote write URL + User (e.g. `https://prometheus-prod-39-prod-eu-north-0.grafana.net/api/prom/push` and user `3166154`).
   - **Loki** — Push URL + User (e.g. `https://logs-prod-025.grafana.net/loki/api/v1/push` and user `1578752`).
   - **Tempo** — **Two URLs are listed**:
     - Native Tempo URL: `https://tempo-prod-XX-prod-eu-north-0.grafana.net/tempo` — used as a **Grafana data source** for queries. Auth user = Tempo tenant ID.
     - OTLP gateway URL: `https://otlp-gateway-prod-eu-north-0.grafana.net/otlp` — used for **writes** from Alloy. **Auth user = your stack instance ID** (NOT the Tempo tenant ID). This trip-up cost us an hour. See [pitfall #5](#9-pitfalls-we-hit-and-how-we-fixed-them).

### 3.3 Create one shared API token

You can create one token per backend, but a single shared token is simpler.

1. `grafana.com` → **Security** → **Access Policies** → **Create access policy**.
2. Scope: enable **`set:alloy-data-write`** (covers `metrics:write`, `logs:write`, `traces:write`).
3. Realms: select your stack(s).
4. Save → click the new policy → **Add token** → name it `alloy-shop-write`. Copy the `glc_…` token value once and store it.

Use the **same** token for `MIMIR_API_KEY`, `LOKI_API_KEY`, and `TEMPO_API_KEY`.

### 3.4 Pre-create data sources in Grafana

Grafana Cloud auto-provisions data sources named `grafanacloud-<your-stack>-prom`, `…-logs`, `…-traces`. You'll see them in **Connections → Data sources**. No setup needed.

---

## 4. Wire credentials into the cluster

### 4.1 The `.env` (local dev)

Add the 9 keys to the repo-root `.env`:

```bash
# Mimir
MIMIR_REMOTE_WRITE_URL="https://prometheus-prod-39-prod-eu-north-0.grafana.net/api/prom/push"
MIMIR_USER=3166154
MIMIR_API_KEY="glc_eyJ…"

# Loki
LOKI_URL="https://logs-prod-025.grafana.net/loki/api/v1/push"
LOKI_USER=1578752
LOKI_API_KEY="glc_eyJ…"

# Tempo (OTLP gateway, NOT native URL — see Phase 3.2)
TEMPO_OTLP_URL="https://otlp-gateway-prod-eu-north-0.grafana.net/otlp"
TEMPO_USER=1620963        # stack instance ID, NOT Tempo tenant ID
TEMPO_API_KEY="glc_eyJ…"
```

### 4.2 Push them into the local cluster

`infra/local/minikube-overlay/seed-secrets.mjs` reads `.env` and creates two Kubernetes Secrets:

- `shop-app-secrets` (in `shop`) — JWT, DB URLs, Kafka, etc.
- `grafana-cloud-credentials` (in `observability`) — the 9 keys above.

```bash
node infra/local/minikube-overlay/seed-secrets.mjs
```

### 4.3 GitHub Actions Secrets (CI/CD)

For AKS / EKS deploys, the same 9 keys live as **GitHub Repository Secrets** (Settings → Secrets and variables → Actions). The `seed-secrets-aks` and `seed-secrets-eks` jobs in `.github/workflows/cd.yml` read them via `${{ secrets.* }}` and `kubectl create secret generic --from-literal=…`. Same Secret name in cluster, different injection path.

### 4.4 Production: upgrade to Azure Key Vault / AWS Secrets Manager

Optional next step (covered in `infra/azure/aks-overlay/azure-guide.md` Phase 9): mount secrets via the **Secrets Store CSI Driver** instead of seeding from CI. Pods pick up rotated values automatically; CI no longer touches secret values.

---

## 5. Deploy Alloy

The whole agent is six YAML files in `infra/k8s/observability/`:

| File | What it does |
|---|---|
| `namespace.yaml` | The `observability` namespace |
| `network-policy.yaml` | Restricts ingress to Alloy's OTLP ports from `shop` only |
| `alloy-config.yaml` | The River config — discovery + scrape + log tail + OTLP receive + tail-sampling + remote write |
| `alloy.yaml` | ServiceAccount + ClusterRole/Binding + Service + DaemonSet |
| `secrets.example.yaml` | Template; the real Secret comes from `seed-secrets.mjs` |
| `README.md` | Operator cheat sheet (kubectl commands + common errors) |

### 5.1 Why a DaemonSet (not a Deployment)?

- **Logs** — log collection needs to happen close to the kubelet that's writing them.
- **Node metrics** — `prometheus.exporter.unix` needs `/proc`, `/sys`, `/` mounted from the host.
- **Locality** — pods send OTLP to `alloy.observability.svc.cluster.local:4318`; the Service load-balances to the nearest node-local Pod.

### 5.2 RBAC (the part that always bites)

The `alloy` ClusterRole needs **two** permissions blocks:

```yaml
- apiGroups: ['']
  resources: [nodes, nodes/proxy, nodes/metrics, services, endpoints, pods, namespaces]
  verbs: [get, list, watch]

- apiGroups: ['']
  resources: [pods/log]                  # SEPARATE from `pods` — easy to miss
  verbs: [get, list, watch]
```

Without `pods/log`, log discovery works (Alloy finds your pods) but log streaming fails with `pods "<name>" is forbidden: cannot get resource "pods/log"`.

### 5.3 The River config in five chunks

**Chunk 1 — Discovery.** Find pods in the `shop` namespace:

```hcl
discovery.kubernetes "shop_pods" {
  role = "pod"
  namespaces { names = ["shop"] }
}
```

**Chunk 2 — Metrics scraping.** Filter to pods annotated for scraping, then build the target URL from `<podIP>:<port><path>`:

```hcl
discovery.relabel "shop_prom_targets" {
  targets = discovery.kubernetes.shop_pods.targets
  rule { source_labels = ["__meta_kubernetes_pod_annotation_prometheus_io_scrape"]
         regex = "true"; action = "keep" }
  rule { source_labels = ["__meta_kubernetes_pod_ip", "__meta_kubernetes_pod_annotation_prometheus_io_port"]
         separator = ";"; regex = "(^[^;]+);(\\d+)"; replacement = "${1}:${2}"
         target_label = "__address__" }
  rule { source_labels = ["__meta_kubernetes_pod_annotation_prometheus_io_path"]
         regex = "(.+)"; replacement = "${1}"; target_label = "__metrics_path__" }
}

prometheus.scrape "shop_services" {
  targets = discovery.relabel.shop_prom_targets.output
  scrape_interval = "30s"
  forward_to = [prometheus.relabel.drop_remote_write_cardinality.receiver]
}

prometheus.remote_write "mimir" {
  endpoint {
    url = sys.env("MIMIR_REMOTE_WRITE_URL")
    basic_auth { username = sys.env("MIMIR_USER"); password = sys.env("MIMIR_API_KEY") }
  }
}
```

> **River vs Prometheus YAML gotcha:** label names must be **quoted strings** in River. `source_labels = [__name__]` (Prometheus YAML) → `source_labels = ["__name__"]` (Alloy River). See [pitfall #2](#9-pitfalls-we-hit-and-how-we-fixed-them).

**Chunk 3 — Logs.** Promote meta-labels to indexed labels (so queries like `{namespace="shop"}` work) and stream container logs via the K8s API:

```hcl
discovery.relabel "shop_log_targets" {
  targets = discovery.kubernetes.shop_pods.targets
  rule { source_labels = ["__meta_kubernetes_namespace"];           target_label = "namespace" }
  rule { source_labels = ["__meta_kubernetes_pod_name"];            target_label = "pod" }
  rule { source_labels = ["__meta_kubernetes_pod_container_name"];  target_label = "container" }
  rule { source_labels = ["__meta_kubernetes_pod_label_app"];       target_label = "app" }
  rule { source_labels = ["__meta_kubernetes_pod_node_name"];       target_label = "node" }
}

loki.source.kubernetes "shop_logs" {
  targets = discovery.relabel.shop_log_targets.output
  forward_to = [loki.write.grafana.receiver]
}

loki.write "grafana" {
  endpoint {
    url = sys.env("LOKI_URL")
    basic_auth { username = sys.env("LOKI_USER"); password = sys.env("LOKI_API_KEY") }
  }
}
```

> **Without the relabel step**, the only labels in Loki are `job` and `instance` — `{namespace="shop"}` returns "No logs found" even though logs are flowing. See [pitfall #4](#9-pitfalls-we-hit-and-how-we-fixed-them).

**Chunk 4 — Traces (OTLP receiver + tail sampling + Tempo write):**

```hcl
otelcol.auth.basic "tempo_auth" {
  username = sys.env("TEMPO_USER")
  password = sys.env("TEMPO_API_KEY")
}

otelcol.receiver.otlp "ingest" {
  grpc { endpoint = "0.0.0.0:4317" }
  http { endpoint = "0.0.0.0:4318" }
  output { traces = [otelcol.processor.tail_sampling.traces_tail.input] }
}

otelcol.processor.tail_sampling "traces_tail" {
  decision_wait = "5s"
  policy { name = "sample-10pct"; type = "probabilistic"
           probabilistic { sampling_percentage = 10 } }
  policy { name = "keep-errors"; type = "status_code"
           status_code { status_codes = ["ERROR"] } }
  output { traces = [otelcol.processor.batch.traces_batch.input] }
}

otelcol.exporter.otlphttp "tempo" {
  client {
    endpoint = sys.env("TEMPO_OTLP_URL")
    auth     = otelcol.auth.basic.tempo_auth.handler   // NOTE: include `.basic`
  }
}
```

> **Component reference path gotcha:** the export path includes the type, so it's `otelcol.auth.basic.tempo_auth.handler`, not `otelcol.auth.tempo_auth.handler`. See [pitfall #3](#9-pitfalls-we-hit-and-how-we-fixed-them).

**Chunk 5 — Node metrics (DaemonSet only):**

```hcl
prometheus.exporter.unix "node" {
  procfs_path = "/host/proc"
  sysfs_path  = "/host/sys"
  rootfs_path = "/host/root"
  disable_collectors = ["wifi", "nfs", "infiniband", "ipvs", "zfs", "xfs"]
}
prometheus.scrape "unix" {
  targets = prometheus.exporter.unix.node.targets
  scrape_interval = "30s"
  forward_to = [prometheus.relabel.drop_remote_write_cardinality.receiver]
}
```

### 5.4 Promote meta-labels to indexed labels

(Already shown in chunk 3.) `discovery.relabel "shop_log_targets"` is the **most important non-obvious step**. Without it, Loki receives the lines but you can't filter them.

---

## 6. Apply and verify

```bash
kubectl apply -f infra/k8s/observability/namespace.yaml
node infra/local/minikube-overlay/seed-secrets.mjs
kubectl apply -k infra/local/minikube-overlay/
kubectl -n observability rollout status daemonset/alloy --timeout=180s
```

(First boot pulls `grafana/alloy:v1.7.5` ~420 MB — allow 3 min on Minikube.)

Confirm Alloy parsed the config and is shipping data:

```bash
kubectl -n observability logs -l app=alloy --tail=80 | grep -i 'opened log stream'
# expect: tailers running for each shop pod

kubectl -n observability logs -l app=alloy --tail=200 \
  | grep -iE 'error|401|403|429|forbidden|dial' || echo "(clean)"

# Port-forward Alloy's metrics endpoint to inspect remote-write counters:
kubectl -n observability port-forward daemonset/alloy 12345:12345 &
curl -s http://localhost:12345/metrics | grep -E '^loki_write_request_duration_seconds_count'
# count > 0 with status_code="204" means Loki accepted N pushes
```

---

## 7. Query the three backends

Open `https://<your-org>.grafana.net` → **Explore**. Use the data source dropdown at the top.

### 7.1 Mimir (metrics)

```promql
up{job="prometheus.scrape.shop_services"} == 1

sum by (route, status_code) (rate(shop_http_request_duration_seconds_count[1m]))

histogram_quantile(0.95, sum by (le, route) (rate(shop_http_request_duration_seconds_bucket[5m])))

sum(rate(shop_http_request_duration_seconds_count{status_code=~"5.."}[5m]))
  / sum(rate(shop_http_request_duration_seconds_count[5m]))

process_resident_memory_bytes{job="prometheus.scrape.shop_services"} / 1024 / 1024

nodejs_eventloop_lag_p99_seconds
```

### 7.2 Loki (logs)

```logql
{namespace="shop"}

{namespace="shop", app="shop-svc"} |~ "(?i)error|warn|exception"

{namespace="shop"} | json | level >= 40

sum by (app) (count_over_time({namespace="shop"}[5m]))
```

### 7.3 Tempo (traces)

In Explore → **Search** form (not Code):

- **Service Name:** `shop-svc` (or any of the 5)
- **Status:** leave blank, or `Error` to filter to failures
- Click **Run query**, click any trace → see the flame chart

To **jump from a log line to its trace**: open a log line in Loki, expand fields, click the `trace_id` value (Grafana auto-detects derived fields and renders a "Tempo" link).

---

## 8. Dashboards and alerts

### 8.1 Dashboards

JSON definitions live in [`infra/grafana/dashboards/`](../infra/grafana/dashboards/). Import via Grafana → **Dashboards → Import → Upload JSON file**.

| Dashboard | What it shows |
|---|---|
| `business-checkout.json` | Checkout funnel: requested vs published vs persisted, p95 of `order_checkout_handle_seconds`, Kafka consumer lag |
| `web-rum.json` | Faro RUM — SPA route load times, errors, web-vitals |

For new dashboards, **build them in the Grafana UI**, then **export JSON** (Settings → JSON Model → copy) and commit under `infra/grafana/dashboards/`.

### 8.2 Alerts

Rules are PromQL/LogQL in [`infra/grafana/alerts.yaml`](../infra/grafana/alerts.yaml). They're plain Prometheus rule-group format, so they work with Mimir Ruler, Grafana Cloud Alerting, or self-hosted Prometheus.

```yaml
- alert: HighErrorRate
  expr: |
    sum(rate(shop_http_request_duration_seconds_count{status_code=~"5.."}[5m]))
      /
    sum(rate(shop_http_request_duration_seconds_count[5m])) > 0.01
  for: 5m
  labels: { severity: warning }
  annotations:
    summary: HTTP 5xx rate above 1%
```

To activate in Grafana Cloud: **Alerting → Alert rules → Import → paste contents**. For drift-free GitOps, manage them via the Grafana Terraform provider (out of scope here).

### 8.3 Adding a new alert

1. Build the query in **Explore → Mimir** until it returns the right values.
2. Wrap it in a rule under `infra/grafana/alerts.yaml`.
3. Pick a `for:` window long enough to ride out flaps (rule of thumb: 2× evaluation interval).
4. Set `labels.severity` so contact points can route correctly (`info`, `warning`, `critical`).
5. Re-import into Grafana.

---

## 9. Pitfalls we hit and how we fixed them

These are the real failures from this codebase. If something doesn't work, you're probably hitting one of these.

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | `daemonsets.apps "alloy" not found` | The overlay was never applied | `kubectl apply -k infra/local/minikube-overlay/` |
| 2 | `component "__name__" does not exist or is out of scope` (and similar `__meta_*`, `__address__`) | River requires label names as **quoted strings**; bare identifiers from Prometheus YAML don't parse | `source_labels = ["__name__"]`, `target_label = "__address__"` |
| 3 | `component "otelcol.auth.tempo_auth.handler" does not exist` | Wrong reference path — must include the component **type** | `otelcol.auth.basic.tempo_auth.handler` (note `.basic`) |
| 4 | Loki query `{namespace="shop"}` returns "No logs found", but Alloy's `loki_write` counter is increasing | `loki.source.kubernetes` strips `__meta_*` labels; only `job` and `instance` survive into Loki by default | Add `discovery.relabel "shop_log_targets"` that promotes `__meta_kubernetes_namespace` → `namespace`, etc. |
| 5 | Tempo: `HTTP 401 Unauthenticated` against `https://otlp-gateway-prod-*.grafana.net/otlp/v1/traces` | The OTLP gateway uses the **stack instance ID** as basic-auth user (visible in token name `stack-<ID>-…`), not the Tempo tenant ID | `TEMPO_USER` = stack ID; re-seed Secret; `kubectl rollout restart daemonset/alloy` |
| 6 | `pods "<name>" is forbidden: ... cannot get resource "pods/log"` | `loki.source.kubernetes` streams logs via the K8s API; the ClusterRole only granted `pods`, not `pods/log` | Add `{ resources: [pods/log], verbs: [get,list,watch] }` to the ClusterRole |
| 7 | `up{job="…"} == 0` for every service, `/metrics` returns `404 Cannot GET /metrics` | The deployed image was built **before** `ObservabilityModule` was wired into the apps | Rebuild images (`docker build`), re-roll (`kubectl set image …`); ensure CI rebuilds on the next push |
| 8 | TS error `Module '"…/pino"' can only be default-imported using the 'esModuleInterop' flag` | `packages/observability/tsconfig.json` was missing `esModuleInterop` | Add `"esModuleInterop": true` (and `allowSyntheticDefaultImports: true`) to that tsconfig |
| 9 | `up{…} == 0` for old pod IPs persists after a rollout | Prometheus keeps the last-known sample queryable for ~5 min (staleness window) | Wait, shorten the time window to "Last 5 min", or filter `up == 1` |
| 10 | Mimir 401 / 429 | Token missing the right scope, or `MIMIR_USER` wrong; `429` = free-tier rate limit | Recreate token with `set:alloy-data-write` scope; double-check `MIMIR_USER` from Stack Details; reduce scrape interval if bursting |
| 11 | Faro `config.json` returns the SPA HTML | nginx route order: `/config.json` was matched by the SPA fallback | Ensure `/config.json` is served **before** the catch-all `try_files $uri /index.html` |
| 12 | 4xx in the app but `status_code="200"` in the metric | The interceptor reads `res.statusCode` at `finalize`, before Nest's exception filter writes the status | Known bug — fix is to read the status from the exception filter chain, or to rely on the access log + Loki for 4xx |

The first 8 are the ones you'll most likely hit on a fresh setup.

---

## 10. Replicating in production (AKS / EKS)

Once it works on Minikube, the cloud paths are essentially identical because everything sits in the same `infra/k8s/observability/` base — the cloud overlays only diff on Ingress + LoadBalancer.

| Step | Local Minikube | AKS / EKS |
|------|----------------|-----------|
| Provision cluster | `minikube start` | Terraform: `infra/azure/terraform/` or `infra/aws/terraform/` |
| Push images | `eval $(minikube docker-env) && docker build` | CI builds + pushes to ACR/ECR/Docker Hub on every merge to `main` |
| Seed `grafana-cloud-credentials` | `node seed-secrets.mjs` (reads `.env`) | `seed-secrets-aks` / `seed-secrets-eks` job in `cd.yml` (reads GitHub Secrets) — or Azure Key Vault via CSI driver |
| Apply manifests | `kubectl apply -k infra/local/minikube-overlay/` | `kubectl apply -k infra/azure/aks-overlay/` |
| Watch the rollout | local kubectl | The CD job's `kubectl rollout status` step + the Job Summary URL |

The exact Azure walkthrough (cluster → CD wiring → Key Vault → first deploy → teardown) is in [`infra/azure/aks-overlay/azure-guide.md`](../infra/azure/aks-overlay/azure-guide.md) Phases 1–11.

---

## TL;DR — minimum viable "I want metrics tomorrow"

1. **Code** — `ObservabilityModule.forRoot({ serviceName })` in `AppModule`. `registerTracing(name)` at the top of `main.ts`.
2. **Manifest** — annotate the Deployment with `prometheus.io/scrape:"true"`, `port`, `path:"/metrics"`.
3. **Grafana Cloud** — sign up, copy 9 env vars from Stack Details, mind the OTLP-gateway-vs-tenant-ID gotcha.
4. **Cluster** — `node seed-secrets.mjs && kubectl apply -k infra/local/minikube-overlay/`.
5. **Verify** — Explore → `up{job="prometheus.scrape.shop_services"} == 1`, `{namespace="shop"}`, Tempo Search → `shop-svc`.
6. **Iterate** — add custom counters/histograms in `business-metrics.ts`; add dashboards under `infra/grafana/dashboards/`; add rules to `infra/grafana/alerts.yaml`.
