# shop-nest-azure

Portfolio demo: React + NestJS microservices on Azure patterns — gateway (GraphQL), user, shop (Mongo + Redis), order (Postgres), Azure Service Bus between shop and order, Docker/K8s, Terraform, CI/CD, observability.

## Documentation

- **[PLAN.md](./PLAN.md)** — architecture, phases, and agent execution order.
- **Interview prep alignment** — extended rationale lives alongside this repo at  
  [`../nestjs/nest-task/interview`](../nestjs/nest-task/interview) (relative to parent `Prototype`; adjust path if your clone layout differs).

## Quick start (local)

```bash
pnpm install
pnpm run build
docker compose up --build
```

Then open **http://localhost:8080** (nginx → `/graphql` proxied to gateway). For Vite dev only: `pnpm --filter @shop/web dev` with gateway on port 3000.

Checkout uses **`CHECKOUT_TRANSPORT=http`** in Compose so **shop-svc** POSTs to **order-svc** (`/internal/checkout`). Set `SERVICEBUS_CONNECTION_STRING` on shop + order and `CHECKOUT_TRANSPORT=auto` or `servicebus` to use Azure Service Bus.

### Environment

Copy `.env.example` files in each app or use root `docker-compose` env. For **Azure Service Bus**, set `SERVICEBUS_CONNECTION_STRING` on shop and order services; otherwise **checkout uses HTTP fallback** to order-svc (see `PLAN.md` / compose).

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

## Observability

- **Correlation ID**: All Nest services attach/propagate `x-correlation-id` when missing.
- **OpenTelemetry**: Set `OTEL_EXPORTER_OTLP_ENDPOINT` (and optional `OTEL_SERVICE_NAME`) on **api-gateway** to export traces to an OTLP collector or Azure Monitor–compatible endpoint.
- **Azure**: Terraform provisions Log Analytics for AKS; enable Application Insights exporter per your environment.

## License

MIT
