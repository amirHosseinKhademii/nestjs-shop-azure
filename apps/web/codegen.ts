import { createRequire } from 'node:module';
import type { CodegenConfig } from '@graphql-codegen/cli';

// Resolve the schema file from the published package rather than reaching into
// the gateway directly. This keeps the codegen flow identical whether the
// schema is consumed via `workspace:*` (today) or from a registry tarball
// (once `@shop/graphql-schema` is published).
const require = createRequire(import.meta.url);
const schemaPath = require.resolve('@shop/graphql-schema/schema.graphql');

const config: CodegenConfig = {
  overwrite: true,
  schema: schemaPath,
  documents: ['src/**/*.{ts,tsx}', '!src/__generated__/**', '!src/**/*.test.{ts,tsx}'],
  generates: {
    './src/__generated__/': {
      preset: 'client',
      presetConfig: {
        fragmentMasking: false,
      },
      config: {
        useTypeImports: true,
        skipTypename: false,
        scalars: {
          DateTime: 'string',
        },
      },
    },
  },
  ignoreNoDocuments: true,
  hooks: {
    afterAllFileWrite: ['prettier --write'],
  },
};

export default config;
