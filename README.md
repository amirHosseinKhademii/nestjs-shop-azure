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
| `infra/terraform` | Azure resources |
| `infra/k8s` | Kubernetes manifests |

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
   committed back to `main` with `[skip ci]` so ArgoCD / Flux (or a manual
   `kubectl apply -k`) picks up the new tag.

### Required secrets / variables

| Setting | GitHub Actions | Azure DevOps |
| --- | --- | --- |
| Docker Hub credentials | `secrets.DOCKERHUB_USERNAME`, `secrets.DOCKERHUB_TOKEN` | Service Connection: `$(DOCKER_REGISTRY_CONNECTION)` |
| Image namespace        | `vars.DOCKERHUB_NAMESPACE` (or fall back to `secrets.DOCKERHUB_USERNAME`) | Pipeline variable: `DOCKERHUB_NAMESPACE` |
| Manifest commit-back   | Repo setting → Workflow permissions → **Read and write** | Project Settings → Repos → Build Service → **Contribute = Allow**. Pipeline vars `GIT_USER_NAME` / `GIT_USER_EMAIL` |

## Observability

- **Correlation ID**: All Nest services attach/propagate `x-correlation-id` when missing.
- **OpenTelemetry**: Set `OTEL_EXPORTER_OTLP_ENDPOINT` (and optional `OTEL_SERVICE_NAME`) on **api-gateway** to export traces to an OTLP collector or Azure Monitor–compatible endpoint.
- **Azure**: Terraform provisions Log Analytics for AKS; enable Application Insights exporter per your environment.

## License

MIT
