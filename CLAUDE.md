# shop-nest-azure — agent instructions

Monorepo: NestJS microservices (GraphQL **api-gateway**, **user-svc** / Postgres, **shop-svc** / Mongo, **order-svc** / Postgres), optional **web** client, Azure-oriented infra. See **`PLAN.md`** for architecture and build order.

## Bundled skills (project-local)

Skills live in **`.agents/skills/<name>/SKILL.md`**. In Cursor, **`.cursor/rules/use-project-agent-skills.mdc`** is set to **always apply** so agents load these when tasks match.

| Skill | Use for |
|-------|-----------|
| `nestjs-best-practices` | Nest apps: modules, DI, security, performance |
| `graphql-schema` | GraphQL schema design (gateway) |
| `mongoose-mongodb` | Mongoose / MongoDB (`shop-svc`) |
| `supabase-postgres-best-practices` | Postgres performance & SQL patterns (TypeORM / Neon) |
| `nodejs-backend-patterns` | General Node backend / REST / microservices patterns |
| `vercel-react-best-practices` | React / front-end performance (`apps/web`) |

**Workflow:** For non-trivial work in those areas, read the matching `SKILL.md` before implementing.

## Repo conventions

- **Secrets:** never commit `.env`; use `env.sample` / `.env.example` patterns where provided.
- **Scope:** match existing Nest patterns in each app; avoid unrelated refactors.
