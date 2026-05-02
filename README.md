# shop-nest-azure

[![CI](https://github.com/amirHosseinKhademii/nestjs-shop-azure/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/amirHosseinKhademii/nestjs-shop-azure/actions/workflows/ci.yml)
[![CD](https://github.com/amirHosseinKhademii/nestjs-shop-azure/actions/workflows/cd.yml/badge.svg?branch=main)](https://github.com/amirHosseinKhademii/nestjs-shop-azure/actions/workflows/cd.yml)
[![workflow runs](https://img.shields.io/badge/Actions-all%20runs-2088FF?logo=github)](https://github.com/amirHosseinKhademii/nestjs-shop-azure/actions)

The badges above show **main-branch CI + CD** on the repo home page (README).
GitHub does not place the Actions pipeline on the overview by default — these
badges are the usual way to surface it.

Portfolio demo: React + NestJS microservices on Azure patterns — gateway (GraphQL), user, shop (Mongo + Redis), order (Postgres), Aiven Kafka or Azure Service Bus between shop and order, Docker/K8s, Terraform, CI/CD, observability.

## Documentation

- **[PLAN.md](./PLAN.md)** — architecture blueprint and implementation order.
- **[docs/observability-roadmap.md](./docs/observability-roadmap.md)** — **start here for observability.** End-to-end roadmap (10 phases) for adding Grafana Cloud + Prometheus from scratch: app instrumentation, Alloy DaemonSet, credentials, queries, dashboards, alerts, and every pitfall we hit.
- **[docs/observability.md](./docs/observability.md)** — architecture diagram, label conventions, runbook snippets.
- **[docs/grafana-cloud-bootstrap.md](./docs/grafana-cloud-bootstrap.md)** — quick reference for the `.env` keys.
- **[infra/k8s/observability/README.md](./infra/k8s/observability/README.md)** — Alloy operator cheat sheet (kubectl commands, common errors).
- **[infra/azure/aks-overlay/azure-guide.md](./infra/azure/aks-overlay/azure-guide.md)** — first-time Azure → AKS deploy walkthrough (account → cluster → CD → live URL → teardown).

## Quick start (local)

```bash
pnpm install
pnpm run build
docker compose up --build
```

Then open **http://localhost:8080** (nginx → `/graphql` proxied to gateway). For Vite dev only: `pnpm --filter @shop/web dev` with gateway on port 3000.

Checkout supports three transports between shop-svc and order-svc, picked via
`CHECKOUT_TRANSPORT` (default **`auto`**):

| Transport | Triggered by | When to use |
| --- | --- | --- |
| `kafka` | `KAFKA_BROKERS` set | **Recommended.** Free hosted broker via [Aiven](https://aiven.io/free-kafka). |
| `servicebus` | `SERVICEBUS_CONNECTION_STRING` set | Azure-native deploys with an existing Service Bus namespace. |
| `http` | nothing else configured | Local-only fallback; shop-svc POSTs directly to order-svc `/internal/checkout`. |

`auto` prefers Kafka → Service Bus → HTTP based on which env vars are present.

### Environment

- Root `.env`: JWT, internal API key, service URLs (see repo `.env.example` if present).
- **shop-svc / MongoDB**: copy [`apps/shop-svc/env.sample`](apps/shop-svc/env.sample) → `apps/shop-svc/.env`, or run `pnpm run init:shop-env`. Set **`MONGO_URI`** (Atlas SRV string with DB path, e.g. `/shop`).
- **Aiven Kafka (free)**: sign up at [aiven.io/free-kafka](https://aiven.io/free-kafka) (no credit card), create a free Apache Kafka service, then copy the connection details into your `.env` / `shop-app-secrets` — see [Free Kafka via Aiven](#free-kafka-via-aiven) below.
- **Azure Service Bus** (optional): set `SERVICEBUS_CONNECTION_STRING` on shop + order; auto-selected when no Kafka is configured.

## Repo layout

| Path | Purpose |
|------|---------|
| `apps/web` | React (Vite) client |
| `apps/api-gateway` | GraphQL BFF, rate limit, JWT |
| `apps/user-svc` | Auth + users (Postgres / TypeORM) |
| `apps/shop-svc` | Products (Mongo), cart (Redis), checkout publisher |
| `apps/order-svc` | Orders (Postgres), Service Bus consumer |
| `infra/k8s` | Production Kubernetes manifests (cert-manager + real DNS) — see [`infra/k8s/README.md`](infra/k8s/README.md) |
| `infra/aws/eks-overlay` | One-shot EKS demo deploy — see [`infra/aws/eks-overlay/Readme.md`](infra/aws/eks-overlay/Readme.md) |
| `infra/azure/aks-overlay` | One-shot AKS demo deploy — see [`infra/azure/aks-overlay/Readme.md`](infra/azure/aks-overlay/Readme.md) |
| `infra/local/minikube-overlay` | One-shot local Minikube deploy — see [`infra/local/minikube-overlay/Readme.md`](infra/local/minikube-overlay/Readme.md) |
| `infra/azure/terraform` | Terraform for the AKS-guide cluster (RG + AKS + Workload Identity Federation) — see [`infra/azure/terraform/README.md`](infra/azure/terraform/README.md) |
| `infra/terraform` | Older Terraform (Postgres + Redis + Service Bus + ACR for fully-Azure-hosted backends) |

## CI / CD

Two pipelines per platform — **CI is always gated before CD**.

| Platform | CI | CD |
| --- | --- | --- |
| GitHub Actions | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | [`.github/workflows/cd.yml`](.github/workflows/cd.yml) |
| Azure DevOps   | [`azure-pipelines-ci.yml`](azure-pipelines-ci.yml)        | [`azure-pipelines-cd.yml`](azure-pipelines-cd.yml)        |

### CI — `format → verify → build`

Runs on **every push to `main`/`v*.*.*` tags and every PR**, in parallel
across all 5 services (`api-gateway`, `web`, `user-svc`, `shop-svc`,
`order-svc`):

1. **Format** — `pnpm run format:check` (Prettier, workspace-wide).
2. **Verify** — `turbo run lint typecheck test --filter=@shop/<svc>`
   (ESLint + `tsc --noEmit` + Jest / Vitest).
3. **Build** — `turbo run build --filter=@shop/<svc>` (TypeScript / Vite
   compilation, no Docker push).

Uses **Node 24** + Corepack (pnpm version pinned via `packageManager` in the
root `package.json`), and Turborepo task cache (`actions/cache@v5` /
Azure `Cache@2`).

### CD — `docker → update-manifests → {seed-secrets, deploy} × {EKS, AKS}`

Runs **only after CI succeeds** on `main` or a `v*.*.*` tag. Never runs for
PRs. Trigger mechanism is the only difference between platforms:

- **GitHub Actions:** `workflow_run` listener — `cd.yml` waits for `ci.yml`
  to complete with `conclusion == 'success'`.
- **Azure DevOps:** `resources.pipelines.shop-ci` declaration — Azure runs
  `azure-pipelines-cd.yml` only after the named CI pipeline succeeds.

Job graph (the cloud branches fan out from `update-manifests` and run in
parallel — both auto-skip when their cluster name variable is unset):

```
                                       ┌─► seed-secrets     ─► deploy      (EKS)
docker (matrix×5) ─► update-manifests ─┤
                                       └─► seed-secrets-aks ─► deploy-aks  (AKS)
```

Stages:

1. **Docker** — buildx multi-tag push to Docker Hub:
   - `sha-<7-char-sha>` — immutable, pinned by manifests.
   - `<branch-or-tag>` — moving pointer (`main`, `v1.2.3`, ...).
   - `latest` — only on `main`.
2. **Update manifests** — `kustomize edit set image` against the
   `images:` block of [`infra/k8s/kustomization.yaml`](infra/k8s/kustomization.yaml),
   committed back to `main` with `[skip ci]`.
3. **Seed secrets** — `kubectl apply` `shop-app-secrets` from CI-side
   secret variables (idempotent). Per cloud:
   - `seed-secrets` (EKS): OIDC → AWS IAM role via composite action [`.github/actions/aws-eks-kubectl`](.github/actions/aws-eks-kubectl/action.yml). Gated on `vars.EKS_CLUSTER_NAME`.
   - `seed-secrets-aks` (AKS): federated `azure/login@v2` via composite action [`.github/actions/azure-aks-kubectl`](.github/actions/azure-aks-kubectl/action.yml). Gated on `vars.AKS_CLUSTER_NAME`.
4. **Deploy** — `kubectl apply -k <overlay>` against the target cluster
   and wait for rollout. Each branch posts a clickable URL via a GitHub
   Environment (`production-eks` / `production-aks`).

### Required secrets / variables

| Setting | GitHub Actions | Azure DevOps |
| --- | --- | --- |
| Docker Hub credentials | `secrets.DOCKERHUB_USERNAME`, `secrets.DOCKERHUB_TOKEN` | Service Connection: `$(DOCKER_REGISTRY_CONNECTION)` |
| Image namespace        | `vars.DOCKERHUB_NAMESPACE` (or fall back to `secrets.DOCKERHUB_USERNAME`) | Pipeline variable: `DOCKERHUB_NAMESPACE` |
| Manifest commit-back   | Repo setting → Workflow permissions → **Read and write** | Project Settings → Repos → Build Service → **Contribute = Allow**. Pipeline vars `GIT_USER_NAME` / `GIT_USER_EMAIL` |
| EKS deploy             | `vars.EKS_CLUSTER_NAME`, `vars.AWS_REGION`, `secrets.AWS_ROLE_TO_ASSUME` — see [`infra/aws/eks-overlay/Readme.md`](infra/aws/eks-overlay/Readme.md) | n/a |
| AKS deploy             | `vars.AKS_CLUSTER_NAME`, `vars.AKS_RESOURCE_GROUP`, `vars.AZURE_TENANT_ID`, `vars.AZURE_SUBSCRIPTION_ID`, `secrets.AZURE_CLIENT_ID` — see [`azure-guide.md`](infra/azure/aks-overlay/azure-guide.md) | `AZURE_SUBSCRIPTION` (Service Connection name), `AKS_CLUSTER_NAME`, `AKS_RESOURCE_GROUP` — see [`infra/azure/aks-overlay/Readme.md`](infra/azure/aks-overlay/Readme.md) |
| App secrets (both)     | `secrets.DATABASE_URL`, `secrets.MONGO_URI`, `secrets.REDIS_URL`, `secrets.JWT_SECRET` | Same names as **secret** pipeline variables |

## Free Kafka via Aiven

The same model as Neon (Postgres), Atlas (Mongo), and Upstash (Redis): a fully
managed cluster on a permanent free tier with **no credit card**. Limits at the
time of writing — 250 KiB/s in/out, 5 topics × 2 partitions, 3-day retention,
TLS + SASL/SCRAM, Karapace Schema Registry included; the cluster auto-powers-off
after 24h idle and reactivates from the console. Plenty for this prototype's
`CheckoutRequested` traffic.

### Authentication modes

Aiven Kafka supports two auth modes — pick whichever your console shows:

- **mTLS** *(Aiven's default — no password is shown, you'll see "Access key" +
  "Access certificate" instead)*: clients authenticate by presenting a client
  cert. Most secure, no shared secret.
- **SASL/SCRAM**: traditional username + password. Has to be explicitly
  enabled in the service's "Authentication methods" panel — once on, a
  password appears next to `avnadmin`.

The code transparently supports both: if `KAFKA_USERNAME` + `KAFKA_PASSWORD`
are set it uses SASL, otherwise it falls back to client-cert auth using
`KAFKA_SSL_CERT` + `KAFKA_SSL_KEY`. Either way, `KAFKA_SSL_CA` is required
for TLS server validation.

### Setup

1. Sign up at [aiven.io/free-kafka](https://aiven.io/free-kafka) and create a
   free **Aiven for Apache Kafka** service.
2. From the service overview page grab the bootstrap `host:port`, the
   **CA certificate**, and *either* the access cert + access key (mTLS)
   *or* the `avnadmin` password (SASL — only after enabling SASL in the
   "Authentication methods" panel).
3. Create a topic named `checkout-events` (2 partitions is fine).
4. Drop the values into either of:

   - **Local dev (Compose)** — root `.env`:

     ```env
     KAFKA_BROKERS=kafka-xxxx-yourproj.aivencloud.com:12345
     KAFKA_TOPIC=checkout-events
     KAFKA_GROUP_ID=order-svc
     CHECKOUT_TRANSPORT=auto

     # CA cert is required for both modes.
     KAFKA_SSL_CA="-----BEGIN CERTIFICATE-----
     ...paste the entire ca.pem here...
     -----END CERTIFICATE-----"

     # --- Option A: mTLS (Aiven default) ---
     KAFKA_SSL_CERT="-----BEGIN CERTIFICATE-----
     ...paste service.cert here...
     -----END CERTIFICATE-----"
     KAFKA_SSL_KEY="-----BEGIN PRIVATE KEY-----
     ...paste service.key here...
     -----END PRIVATE KEY-----"

     # --- Option B: SASL (only if you've enabled SASL in Aiven) ---
     # KAFKA_USERNAME=avnadmin
     # KAFKA_PASSWORD=replace-me
     ```

   - **CI / CD (EKS or AKS)** — add the same as **GitHub Actions Secrets**
     (`Settings → Secrets and variables → Actions`):
     `KAFKA_BROKERS`, `KAFKA_SSL_CA`, `KAFKA_TOPIC`, `KAFKA_GROUP_ID`, and
     either `KAFKA_SSL_CERT` + `KAFKA_SSL_KEY` (mTLS) or
     `KAFKA_USERNAME` + `KAFKA_PASSWORD` (SASL). The `seed-secrets` jobs in
     [`cd.yml`](.github/workflows/cd.yml) pass them through to
     `shop-app-secrets` only when set, so existing deployments without Aiven
     stay green.

5. The `order-svc` Kafka listener auto-enables when `KAFKA_BROKERS` is
   present in `shop-app-secrets`. Set `KAFKA_LISTENER_ENABLED=false` on the
   deployment to opt out (see [`infra/k8s/order-svc.yaml`](infra/k8s/order-svc.yaml)).

### Verifying

After deploy, check the logs:

```bash
kubectl -n shop logs deploy/shop-svc  | grep -i kafka
kubectl -n shop logs deploy/order-svc | grep -i kafka
```

You should see `Kafka producer connected` on shop-svc and
`Kafka listener subscribed to checkout-events` on order-svc. Trigger a
checkout from the SPA — order-svc will log `Order ... created for correlation
...` shortly after.

## Observability

- **Correlation ID**: All Nest services attach/propagate `x-correlation-id` when missing.
- **OpenTelemetry**: Set `OTEL_EXPORTER_OTLP_ENDPOINT` (and optional `OTEL_SERVICE_NAME`) on **api-gateway** to export traces to an OTLP collector or Azure Monitor–compatible endpoint.
- **Azure**: Terraform provisions Log Analytics for AKS; enable Application Insights exporter per your environment.

## License

MIT
