# task-svc

Standalone **ASP.NET Core 10** service for managing user tasks. Backed by
**PostgreSQL via EF Core**. Lives outside the pnpm/Turbo graph and the
api-gateway — it's intentionally not wired into the rest of the monorepo so
it can be iterated on (or torn down) without rippling through the
GraphQL/JWT/Mongo plumbing.

It runs **like every other service in this repo**: pick any reachable
Postgres (Neon, a local install, a remote dev DB), drop one env var into the
root `.env`, and `pnpm dev:task` boots the server.

## Layout

```
apps/task-svc/
├── Caching/            # ITaskCache + Redis/in-memory cache-aside layer + AddTaskCache()
├── Controllers/        # HTTP surface — controllers map URLs to ITaskService
├── Data/               # DbContext, design-time factory, migrations + AddTasksDatabase()
├── Domain/             # TaskItem entity + enums (status, priority)
├── Dtos/               # Request/response shapes (separate from entities)
├── Hosting/            # Cross-cutting host plumbing: env loader, CORS, ProblemDetails,
│                       #   health writer, dev-time migration runner
├── RateLimiting/       # Rate-limit options + AddTaskRateLimiting()
├── Services/           # ITaskService + TaskService (business logic)
├── Properties/         # launchSettings.json (dev profile)
├── Program.cs          # ~70-line composition root — calls .env loader then chains
│                       #   AddTask*(...) extensions for each feature
├── appsettings*.json   # Hierarchical config; secrets come from .env / env vars
├── env.example         # Documented env-var contract
├── Dockerfile          # Production image (multi-stage, non-root). Not used in dev.
└── task-svc.csproj
```

## Prerequisites

- **.NET 10 SDK** (any 10.0.x) — [download](https://dotnet.microsoft.com/download)
- **Postgres** somewhere you can reach — **Neon free tier** is the easiest path
  and matches what the Nest services already use.
- **`dotnet-ef` global tool** for migrations:
  ```bash
  dotnet tool install --global dotnet-ef --version 10.0.4
  ```

## Configure the database

Pick **one** location for the connection string, in this priority order:

| Where | When to use |
|---|---|
| **`<repo-root>/.env`** | **Recommended.** Same place the Nest services read their secrets — keeps everything in one file. |
| `apps/task-svc/.env`   | Service-local override (e.g. point only `task-svc` at a different DB while everything else stays on the shared one). |
| Shell export           | Quick experiments: `TASK_DATABASE_URL=... pnpm dev:task` |

Add this line to whichever file you picked (note: file must be named **`.env`**
with the leading dot):

```env
# libpq URI form (works for Neon — copy the connection string from the Neon UI)
TASK_DATABASE_URL=postgresql://user:pass@ep-xyz.eu-central-1.aws.neon.tech/tasks?sslmode=require

# OR Npgsql key/value form (works for any Postgres)
TASK_DATABASE_URL=Host=localhost;Port=5432;Database=tasks;Username=postgres;Password=secret
```

Both forms are accepted — Npgsql parses URI form natively. The DB user needs
`CREATE TABLE` permission the first time the service boots (it auto-applies
the EF Core migration in `Development`).

That's the only required env var. See `env.example` for optional knobs
(`ASPNETCORE_ENVIRONMENT`, `ASPNETCORE_HTTP_PORTS`, `Cors__AllowedOrigins__*`).

## Run

```bash
# 1. Just task-svc (alongside whatever else you have running)
pnpm dev:task

# 2. Whole stack (Nest services + task-svc, with prefixed parallel logs)
pnpm dev:full

# 3. Direct dotnet, equivalent to (1)
dotnet run --project apps/task-svc
```

`launchSettings.json` binds the service to **http://localhost:3004**. In
Development the EF Core migration is applied automatically on boot, and the
interactive OpenAPI explorer is available at **http://localhost:3004/scalar**.

## REST API

Base path: `/api/tasks`

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| GET    | `/api/tasks`        | — | `PagedResult<TaskResponse>` | Query: `page`, `pageSize` (1–100), `status`, `priority`, `q` |
| GET    | `/api/tasks/{id}`   | — | `TaskResponse` | 404 if not found |
| POST   | `/api/tasks`        | `CreateTaskRequest` | `TaskResponse` | 201 + `Location` header |
| PUT    | `/api/tasks/{id}`   | `UpdateTaskRequest` | `TaskResponse` | Full replace; 404 if not found |
| DELETE | `/api/tasks/{id}`   | — | 204 | 404 if not found |
| GET    | `/health/live`      | — | `{ status: "ok" }` | Always 200 |
| GET    | `/health/ready`     | — | JSON health report | 503 when Postgres is down |

Errors follow **RFC 7807** (`application/problem+json`), including a `traceId`
extension that ties responses back to ASP.NET Core request logs.

```bash
curl -s http://localhost:3004/api/tasks \
  -H 'content-type: application/json' \
  -d '{"title":"Write blog post","priority":"High","dueDate":"2026-06-01T00:00:00Z"}'
```

## Caching

`GET /api/tasks/{id}` is served through a cache-aside layer backed by
`IDistributedCache`. The backend is selected at startup:

| Condition | Backend |
|---|---|
| `REDIS_URL` is set | **Redis** via `Microsoft.Extensions.Caching.StackExchangeRedis`. Both URI form (`rediss://default:pw@host:6379`, what Upstash hands out) and StackExchange.Redis key/value form are accepted. |
| `REDIS_URL` is unset | **In-memory** `MemoryDistributedCache`. Survives the process lifetime only — fine for `dotnet run`, not safe for multi-replica deployments. |

The active backend is logged at startup, e.g.

```
[task-svc] cache backend → Redis (top-gazelle-112090.upstash.io:6379)
```

**Keys.** `{KeyPrefix}task:{id-hex}` (default prefix `task-svc:`). The prefix
namespaces this service's keys away from the Nest stack which shares the
same Upstash instance — change `Caching:KeyPrefix` if you ever fan out into
multiple instances of this service against the same Redis.

**TTL.** 5 minutes sliding (`Caching:TtlSeconds`). Tunable per environment.

**Invalidation.** Writes (`PUT`/`DELETE`) explicitly remove the entry **after**
the DB commits. Cache failures are logged and swallowed — a degraded cache
must never take down a request. List endpoints (`GET /api/tasks`) are
intentionally not cached: keying them on the full filter+page tuple makes
invalidation fragile, and the gain is marginal for a typical UI that loads
list → detail.

## Rate limiting

Two named policies are wired up via the built-in
`Microsoft.AspNetCore.RateLimiting` middleware. Both partition by client IP
so a noisy peer can't burn the global budget.

| Policy | Applied to | Default | Tunable via |
|---|---|---|---|
| `read`  | `GET` endpoints           | 100 req / 60 s / IP | `RateLimiting:Read:{PermitLimit,WindowSeconds}` |
| `write` | `POST` / `PUT` / `DELETE` | 20 req / 60 s / IP  | `RateLimiting:Write:{PermitLimit,WindowSeconds}` |

Health checks are mapped **before** the rate limiter so orchestrator probes
are never throttled.

Rejected requests return **`429 Too Many Requests`** with an RFC 7807 body
and a `Retry-After` header (seconds), matching the rest of the API's error
shape:

```json
{
  "type": "https://httpstatuses.io/429",
  "title": "Too many requests",
  "status": 429,
  "detail": "Rate limit exceeded. Slow down and retry after the value in the Retry-After header.",
  "traceId": "0HNF…"
}
```

> **Multi-replica caveat.** ASP.NET Core's built-in rate limiter is
> in-process, so a deployment running N replicas effectively allows N×limit
> requests per partition. For globally consistent limits behind a load
> balancer, replace the `Partition(...)` factory in `Program.cs` with a
> Redis-backed limiter (e.g. `RedisRateLimiting.AspNetCore`).

## Database notes

- Provider: **Npgsql** + EF Core 10
- Naming convention: **snake_case** tables/columns (via `EFCore.NamingConventions`)
- Concurrency: native Postgres `xmin` row version — concurrent updates throw
  `DbUpdateConcurrencyException` which the controller can map to `409 Conflict`
  when concurrency UI is added.
- Status/Priority are persisted as text (not int) for readability in `psql`.

### Migrations

The service auto-applies pending migrations on startup in `Development`. To
manage them by hand:

```bash
dotnet ef migrations add <Name> \
  --project apps/task-svc \
  --output-dir Data/Migrations

dotnet ef database update --project apps/task-svc

dotnet ef migrations script --idempotent --project apps/task-svc \
  -o apps/task-svc/Data/Migrations/migrate.sql
```

## CI

A dedicated `Verify+Build · task-svc` job runs in `.github/workflows/ci.yml`
in parallel with the Node service matrix. Steps: `dotnet format --verify-no-changes`
→ `dotnet restore` → `dotnet build -c Release` → `dotnet test`. Once a test
project exists under this folder, `dotnet test` automatically picks it up.

## Why isolated?

Per the current scope, this service does **not** participate in the GraphQL
gateway, the JWT auth flow, or any cross-service contracts. That keeps the
blast radius small while iterating on the .NET stack. When integration is
desired:

1. Add a `task-resolver.ts` in `apps/api-gateway/src/graphql/`.
2. Add a `TaskBackendService` to `backend-http.service.ts` (it already
   demonstrates the auth/header passthrough pattern for HTTP-backed resolvers).
3. Forward the `Authorization` header from the gateway and validate it inside
   `task-svc` (e.g. via `Microsoft.AspNetCore.Authentication.JwtBearer`).
