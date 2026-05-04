#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const source = join(repoRoot, 'apps', 'api-gateway', 'src', 'schema.gql');
const dest = join(here, '..', 'schema.graphql');

if (!existsSync(source)) {
  console.error(
    `[graphql-schema] Source SDL not found at ${source}.\n` +
      `Run the api-gateway in dev mode at least once, or invoke ` +
      `\`pnpm --filter @shop/api-gateway run schema:emit\` to regenerate it.`,
  );
  process.exit(1);
}

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(source, dest);
console.log(`[graphql-schema] Copied ${source} -> ${dest}`);
