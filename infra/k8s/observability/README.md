# In-cluster Grafana Alloy

Alloy runs as a **DaemonSet** in namespace `observability` and forwards:

| Signal   | Source                         | Destination (Grafana Cloud) |
| -------- | ------------------------------ | --------------------------- |
| Metrics  | Prometheus scrape + `node`     | Mimir (`remote_write`)      |
| Logs     | `loki.source.kubernetes` (shop)| Loki push                   |
| Traces   | OTLP gRPC/HTTP `:4317`/`:4318` | Tempo (OTLP HTTP + basic auth) |

## Prerequisites

1. Create namespace + Secret (see [`secrets.example.yaml`](./secrets.example.yaml)):

   ```bash
   kubectl apply -f infra/k8s/observability/namespace.yaml
   kubectl apply -f secrets-grafana.yaml   # your copy with real values
   ```

2. Apply the base kustomization (parent [`../kustomization.yaml`](../kustomization.yaml) already references these files).

## Configuration

River config lives in ConfigMap `alloy-config` (`config.alloy` key). To validate syntax locally:

```bash
docker run --rm -v "$PWD/infra/k8s/observability/alloy-config.yaml:/tmp/c.yaml:ro" \
  docker.io/grafana/alloy:v1.7.5 fmt /tmp/c.yaml
```

(Extract the `config.alloy` file body if you want `alloy fmt` on the raw River text.)

## Swapping Grafana Cloud for self-hosted Mimir/Loki/Tempo

Replace the `prometheus.remote_write`, `loki.write`, and `otelcol.exporter.otlphttp` endpoints (and drop basic auth blocks if not needed). Keep the same scrape / OTLP / log discovery sections.

## Notes

- The Alloy container runs **privileged** with host `/proc`, `/sys`, and `/` mounts so `prometheus.exporter.unix` can expose node-level metrics. Tighten in hardened clusters if you only need app metrics + logs + traces.
- Workloads in `shop` send OTLP to `http://alloy.observability.svc.cluster.local:4318` (see Deployments in `infra/k8s/*.yaml`).

---

## Cheat sheet — running, debugging, restarting Alloy

All commands assume you are pointing at the right cluster (`kubectl config current-context`). For Minikube this is `minikube`; for AKS / EKS, run the cluster's `get-credentials` command first.

### Bring it up / re-apply changes

```bash
kubectl apply -f infra/k8s/observability/namespace.yaml

node infra/local/minikube-overlay/seed-secrets.mjs

kubectl apply -k infra/local/minikube-overlay/

kubectl -n observability rollout status daemonset/alloy --timeout=180s
```

> First boot pulls `grafana/alloy:v1.7.5` (~420 MB). Allow up to 3 min on Minikube.

### Health checks

```bash
kubectl -n observability get pods,daemonset,svc,cm -l app=alloy

kubectl -n observability get cm alloy-config -o jsonpath='{.data.config\.alloy}' | head -40

kubectl -n observability get secret grafana-cloud-credentials \
  -o go-template='{{range $k,$_ := .data}}{{$k}}{{"\n"}}{{end}}'
```

### Logs (live + filtered)

```bash
kubectl -n observability logs -l app=alloy -f --tail=100

kubectl -n observability logs -l app=alloy --tail=500 \
  | grep -iE 'error|401|403|429|forbidden|dial|refused|timeout'

kubectl -n observability logs -l app=alloy --tail=200 | grep -i 'opened log stream'

kubectl -n observability logs -l app=alloy --tail=200 \
  | grep -iE 'remote_write|prometheus.remote_write'
```

### Pick up a config or secret change

ConfigMap and Secret changes do **not** auto-restart pods (no checksum annotation). Re-roll after editing:

```bash
kubectl apply -k infra/local/minikube-overlay/

kubectl -n observability rollout restart daemonset/alloy
kubectl -n observability rollout status  daemonset/alloy --timeout=120s
```

If you only changed RBAC (`alloy.yaml` ClusterRole), no restart is needed — Alloy's tailers auto-retry.

### Validate the River config

```bash
kubectl -n observability get cm alloy-config -o jsonpath='{.data.config\.alloy}' > /tmp/config.alloy

docker run --rm -v /tmp/config.alloy:/etc/alloy/config.alloy:ro \
  docker.io/grafana/alloy:v1.7.5 fmt /etc/alloy/config.alloy
```

### Hit Alloy's own HTTP UI / metrics

```bash
kubectl -n observability port-forward daemonset/alloy 12345:12345

open http://localhost:12345
```

### Send a test trace through the in-cluster OTLP endpoint

```bash
kubectl -n observability port-forward svc/alloy 4318:4318

curl -i -X POST http://localhost:4318/v1/traces \
  -H 'Content-Type: application/json' \
  -d '{"resourceSpans":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"smoketest"}}]},"scopeSpans":[{"spans":[{"traceId":"5b8aa5a2d2c872e8321cf37308d69df2","spanId":"051581bf3cb55c13","name":"hello","kind":1,"startTimeUnixNano":"1719859200000000000","endTimeUnixNano":"1719859201000000000"}]}]}]}'
```

A `200 OK` means Alloy accepted it; check Grafana Cloud → Explore → Tempo, service `smoketest`.

### Tear it down (Minikube)

```bash
kubectl delete -k infra/local/minikube-overlay/

kubectl delete namespace observability
```

---

## Common errors and fixes

| Symptom in `kubectl logs -l app=alloy`                                                                                              | Cause                                                                                                                                                                | Fix |
|-------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----|
| `daemonsets.apps "alloy" not found`                                                                                                  | Overlay was never applied                                                                                                                                            | `kubectl apply -k infra/local/minikube-overlay/` |
| `component "__name__" does not exist or is out of scope` (and similar `__meta_*`, `__address__`, `__metrics_path__`)                 | River requires label names as **quoted strings**; Prometheus YAML conventions like bare `__name__` don't parse                                                        | Use `source_labels = ["__name__"]`, `target_label = "__address__"` |
| `component "otelcol.auth.tempo_auth.handler" does not exist`                                                                         | Wrong reference path — the export is `<type>.<label>.<field>`                                                                                                         | `otelcol.auth.basic.tempo_auth.handler` (include `.basic`) |
| `pods "<name>" is forbidden: ... cannot get resource "pods/log" in API group ""`                                                     | `loki.source.kubernetes` streams logs via the K8s API; the `alloy` ClusterRole was missing `pods/log`                                                                 | Add `{ resources: [pods/log], verbs: [get,list,watch] }` to ClusterRole `alloy` |
| Tempo: `HTTP 401 Unauthenticated` against `https://otlp-gateway-prod-*.grafana.net/otlp/v1/traces`                                   | The OTLP gateway uses the **Grafana Cloud stack instance ID** as basic-auth user (visible in token name `stack-<ID>-...`), not the Tempo tenant ID                    | Set `TEMPO_USER` to the stack ID, re-seed Secret, restart DaemonSet |
| Mimir: `HTTP 401`                                                                                                                    | Token doesn't have `metrics:write` (or the shared `set:alloy-data-write` Access Policy scope), or `MIMIR_USER` is wrong                                               | Recreate token with the correct Access Policy scope; double-check `MIMIR_USER` from "Stack Details" |
| Loki: `HTTP 401` / `429`                                                                                                             | Same as Mimir, but for `logs:write`. `429` = rate limit on free tier                                                                                                  | Verify token scopes; reduce log volume or upgrade plan |
| Pod `CrashLoopBackOff` immediately on start                                                                                          | Almost always a River parse error                                                                                                                                    | `kubectl -n observability logs -l app=alloy --previous` shows the parser error with line numbers |
| Pod stuck `ContainerCreating` for >1 min                                                                                             | Slow image pull on first run                                                                                                                                         | Wait, or pre-pull with `minikube image pull docker.io/grafana/alloy:v1.7.5` |
