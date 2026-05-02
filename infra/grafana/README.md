# Grafana Cloud dashboards & alert rules

Version-controlled artefacts for **manual import** into Grafana Cloud (or Mimir ruler upload).

| File / folder | Purpose |
| ------------- | ------- |
| [`dashboards/`](./dashboards/) | Dashboard JSON — **Dashboards → Import → Upload JSON** |
| [`alerts.yaml`](./alerts.yaml) | Prometheus-format rule groups — import via **Alerting → Alert rules** or Mimir ruler API |

CI upload (Terraform `grafana` provider) is intentionally deferred per project plan.
