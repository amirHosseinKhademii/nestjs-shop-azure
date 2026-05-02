# Grafana Cloud bootstrap (Phase 0)

Complete this **once** before enabling in-cluster Alloy or wiring `.env` / GitHub Secrets.

## 1. Create a free stack

1. Sign up at [grafana.com](https://grafana.com) and create a **Grafana Cloud** stack (e.g. `shopdemo`).
2. Open **Grafana** in that stack (hosted URL like `https://yourorg.grafana.net`).

## 2. Metrics (Mimir / Prometheus remote_write)

1. In Grafana: **Connections → Add new connection → Prometheus** (or **Hosted Prometheus** / **Mimir** depending on UI).
2. Copy for **remote_write**:
   - **Remote write URL** → `MIMIR_REMOTE_WRITE_URL`
   - **User / Instance ID** → `MIMIR_USER`
   - **API key** (create a key with MetricsPublisher scope) → `MIMIR_API_KEY`

## 3. Logs (Loki)

1. **Connections → Add new connection → Loki**.
2. Copy:
   - **Loki URL** (push) → `LOKI_URL`
   - **User** → `LOKI_USER`
   - **Token** → `LOKI_API_KEY`

## 3b. Logs note (Alloy)

The Alloy config in this repo ships a **file log** pipeline (tail `/var/log/pods/...`) when the DaemonSet mounts the node log directory. If your cluster uses a non-standard log path, adjust [infra/k8s/observability/alloy-config.yaml](../infra/k8s/observability/alloy-config.yaml).

## 4. Traces (Tempo OTLP)

1. **Connections → Add new connection → Tempo** (OTLP).
2. Copy the **OTLP HTTP** endpoint (often ends with `/otlp` or is the base URL for OTLP) → `TEMPO_OTLP_URL`
3. **User** → `TEMPO_USER`
4. **API key** → `TEMPO_API_KEY`

## 5. Frontend RUM (Faro)

1. In Grafana Cloud: **Frontend Observability** (or **Faro**) → **Create new app** → name `shop-web`.
2. Copy:
   - **Collector URL** → `FARO_URL`
   - **App API key** (public in browser; still treat as config, not a password) → `FARO_APP_KEY`

## 6. Wire into the repo

| Where | What to do |
| --- | --- |
| Local `.env` | Add the eight variables (see [infra/k8s/observability/secrets.example.yaml](../infra/k8s/observability/secrets.example.yaml)). |
| Kubernetes | Run [infra/local/minikube-overlay/seed-secrets.mjs](../infra/local/minikube-overlay/seed-secrets.mjs) — it creates `grafana-cloud-credentials` when those keys are set. |
| GitHub Actions | Add the same names as **repository secrets** for future CD seeding. |

## 7. Free tier guardrails

- Stay under **active series** limits: avoid high-cardinality labels (`userId`, raw URLs). This repo uses normalized routes and bounded labels.
- Trace **sampling** defaults to parent-based ratio (see `OTEL_TRACES_SAMPLER_ARG` in deployments).
- **Rotate API keys** if leaked; keys in Faro `config.json` are browser-visible by design.

## 8. Optional: remote Terraform / dashboards

Provisioning dashboards via API is optional. This repo stores JSON under `infra/grafana/dashboards/` for manual import (**Dashboards → Import → Upload JSON**).
