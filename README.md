# shop-nest-azure

[![CI](https://github.com/amirHosseinKhademii/nestjs-shop-azure/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/amirHosseinKhademii/nestjs-shop-azure/actions/workflows/ci.yml)
[![CD](https://github.com/amirHosseinKhademii/nestjs-shop-azure/actions/workflows/cd.yml/badge.svg?branch=main)](https://github.com/amirHosseinKhademii/nestjs-shop-azure/actions/workflows/cd.yml)
[![workflow runs](https://img.shields.io/badge/Actions-all%20runs-2088FF?logo=github)](https://github.com/amirHosseinKhademii/nestjs-shop-azure/actions)

The badges above show **main-branch CI + CD** on the repo home page (README).
GitHub does not place the Actions pipeline on the overview by default — these
badges are the usual way to surface it.

Portfolio demo: React + NestJS microservices on Azure patterns — gateway (GraphQL), user, shop (Mongo + Redis), order (Postgres), Azure Service Bus between shop and order, Docker/K8s, Terraform, CI/CD, observability.

## Documentation

- **[PLAN.md](./PLAN.md)** — architecture blueprint and implementation order.
- **[azure-guide.md](./azure-guide.md)** — first-time Azure → AKS deploy walkthrough (account → cluster → CD → live URL → teardown).

## Quick start (local)

```bash
pnpm install
pnpm run build
docker compose up --build
```

Then open **http://localhost:8080** (nginx → `/graphql` proxied to gateway). For Vite dev only: `pnpm --filter @shop/web dev` with gateway on port 3000.

Checkout uses **`CHECKOUT_TRANSPORT=http`** in Compose so **shop-svc** POSTs to **order-svc** (`/internal/checkout`). Set `SERVICEBUS_CONNECTION_STRING` on shop + order and `CHECKOUT_TRANSPORT=auto` or `servicebus` to use Azure Service Bus.

### Environment

- Root `.env`: JWT, internal API key, service URLs (see repo `.env.example` if present).
- **shop-svc / MongoDB**: copy [`apps/shop-svc/env.sample`](apps/shop-svc/env.sample) → `apps/shop-svc/.env`, or run `pnpm run init:shop-env`. Set **`MONGO_URI`** (Atlas SRV string with DB path, e.g. `/shop`).
- **Azure Service Bus**: set `SERVICEBUS_CONNECTION_STRING` on shop + order; otherwise **checkout uses HTTP fallback** to order-svc (`CHECKOUT_TRANSPORT=http`).

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
| `k8s-local` | Local Minikube manifests (`imagePullPolicy: Never`) — see [`k8s-local/README.md`](k8s-local/README.md) |
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

### CD — `docker → update-manifests`

Runs **only after CI succeeds** on `main` or a `v*.*.*` tag. Never runs for
PRs. Trigger mechanism is the only difference between platforms:

- **GitHub Actions:** `workflow_run` listener — `cd.yml` waits for `ci.yml`
  to complete with `conclusion == 'success'`.
- **Azure DevOps:** `resources.pipelines.shop-ci` declaration — Azure runs
  `azure-pipelines-cd.yml` only after the named CI pipeline succeeds.

Stages (per service, in parallel):

1. **Docker** — buildx multi-tag push to Docker Hub:
   - `sha-<7-char-sha>` — immutable, pinned by manifests.
   - `<branch-or-tag>` — moving pointer (`main`, `v1.2.3`, ...).
   - `latest` — only on `main`.
2. **Update manifests** — `kustomize edit set image` against the
   `images:` block of [`infra/k8s/kustomization.yaml`](infra/k8s/kustomization.yaml),
   committed back to `main` with `[skip ci]`.
3. **Seed secrets** — `kubectl apply` `shop-app-secrets` from CI-side
   secret variables (idempotent). Skipped when no cluster is configured.
4. **Deploy** — `kubectl apply -k <overlay>` against the target cluster
   and wait for rollout. Skipped when no cluster is configured.

### Required secrets / variables

| Setting | GitHub Actions | Azure DevOps |
| --- | --- | --- |
| Docker Hub credentials | `secrets.DOCKERHUB_USERNAME`, `secrets.DOCKERHUB_TOKEN` | Service Connection: `$(DOCKER_REGISTRY_CONNECTION)` |
| Image namespace        | `vars.DOCKERHUB_NAMESPACE` (or fall back to `secrets.DOCKERHUB_USERNAME`) | Pipeline variable: `DOCKERHUB_NAMESPACE` |
| Manifest commit-back   | Repo setting → Workflow permissions → **Read and write** | Project Settings → Repos → Build Service → **Contribute = Allow**. Pipeline vars `GIT_USER_NAME` / `GIT_USER_EMAIL` |
| EKS deploy             | `vars.EKS_CLUSTER_NAME`, `vars.AWS_REGION`, `secrets.AWS_ROLE_TO_ASSUME` — see [`infra/aws/eks-overlay/Readme.md`](infra/aws/eks-overlay/Readme.md) | n/a |
| AKS deploy             | n/a (mirror the EKS jobs swapping `azure/login@v2` — see notes) | `AZURE_SUBSCRIPTION` (Service Connection name), `AKS_CLUSTER_NAME`, `AKS_RESOURCE_GROUP` — see [`infra/azure/aks-overlay/Readme.md`](infra/azure/aks-overlay/Readme.md) |
| App secrets (both)     | `secrets.DATABASE_URL`, `secrets.MONGO_URI`, `secrets.REDIS_URL`, `secrets.JWT_SECRET` | Same names as **secret** pipeline variables |

## Observability

- **Correlation ID**: All Nest services attach/propagate `x-correlation-id` when missing.
- **OpenTelemetry**: Set `OTEL_EXPORTER_OTLP_ENDPOINT` (and optional `OTEL_SERVICE_NAME`) on **api-gateway** to export traces to an OTLP collector or Azure Monitor–compatible endpoint.
- **Azure**: Terraform provisions Log Analytics for AKS; enable Application Insights exporter per your environment.

## License

MIT
