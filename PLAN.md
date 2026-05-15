# shop-nest-azure — implementation blueprint

This file mirrors the approved architecture plan. **Do not treat this as executable code** — it describes scope and ordering for contributors.

## Purpose and constraints

- **Goal**: Portfolio-grade Azure microservices demo: event-driven integration, GraphQL + polyglot DBs, Redis, rate limiting, K8s, CI/CD (GitHub Actions + Azure Pipelines), Terraform, observability — kept simple (happy paths, stubs where enterprise complexity dominates).

- **Repo**: This repo implements the blueprint; extended interview Q&A stays in the interview folder (linked from README).

## Traffic rules

- **`/`** → React static (nginx in K8s).
- **`/graphql`** → api-gateway only; internal services ClusterIP only.

## Checkout transport

- **Production**: Shop publishes `CheckoutRequested` to **Azure Service Bus**; Order consumes.
- **Local without Azure**: Set `CHECKOUT_TRANSPORT=http` — shop POSTs to order-svc internal endpoint (see env examples).

## Agent execution order

1. Scaffold monorepo + docker-compose + health endpoints.
2. user-svc + gateway JWT.
3. shop-svc (products, cart, checkout publish).
4. order-svc + consumer + idempotency.
5. management-svc (Go, chi + sqlc + Postgres).
6. Gateway GraphQL → REST backends.
7. React client.
8. Dockerfiles + K8s + Ingress.
9. Terraform phases + Front Door notes.
10. Dual CI/CD pipelines.
11. OpenTelemetry + correlation IDs.

## Gaps explicitly covered in implementation

- Service-to-service: shared **internal API key** header for gateway→services (demo).
- Payments/shipping stubbed.
- Secrets via env / Key Vault in Terraform docs only.
