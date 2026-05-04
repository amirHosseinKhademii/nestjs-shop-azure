# @shop/graphql-schema

Public GraphQL SDL contract for the `@shop/api-gateway` service.

This package exists so client apps (the in-repo `@shop/web`, partner clients,
or future split-out front-ends) can codegen typed operations against a pinned
schema version without needing the gateway running locally.

## Source of truth

The SDL is **code-first** in `apps/api-gateway` (Nest `@ObjectType` /
`@Resolver` decorators). At api-gateway dev boot, `@nestjs/graphql` writes the
generated SDL to `apps/api-gateway/src/schema.gql`, which is committed.

This package's `prebuild` script (`scripts/copy-schema.mjs`) copies that file
to `packages/graphql-schema/schema.graphql` so the package always ships the
latest committed contract.

## Consumer usage

### Codegen (file path)

```ts
// codegen.ts
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'node_modules/@shop/graphql-schema/schema.graphql',
  documents: ['src/**/*.{ts,tsx}'],
  generates: { './src/__generated__/': { preset: 'client' } },
};
export default config;
```

### Programmatic (typeDefs / DocumentNode)

```ts
import { getTypeDefs, getSchemaDocument } from '@shop/graphql-schema';

const sdl = getTypeDefs();
const doc = getSchemaDocument();
```

## Versioning

Treat schema changes as a public API:

- **Patch** — additive changes that can't break clients (new optional field,
  new query/mutation, new enum value on an output enum).
- **Minor** — additive changes that *might* require client work (new required
  argument with default, deprecations).
- **Major** — breaking changes (removed/renamed fields, type changes,
  required-arg additions without defaults).

Use `changesets` (`pnpm exec changeset`) to record the intent and bump on
release.
