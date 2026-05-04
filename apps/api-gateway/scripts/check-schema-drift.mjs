#!/usr/bin/env node
/**
 * Validates that the committed `apps/api-gateway/src/schema.gql` matches what
 * the resolvers would generate today. Run as part of CI before publishing
 * `@shop/graphql-schema` so the SDL contract can never silently drift from
 * the implementation.
 *
 * Flow:
 *   1. Emit the SDL to a temp file via `dist/scripts/emit-schema.js`
 *      (assumes `nest build` has already produced `dist/`).
 *   2. Byte-compare against the committed source.
 *   3. On mismatch, print a unified diff and exit non-zero.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const gatewayRoot = resolve(here, '..');
const distEmit = join(gatewayRoot, 'dist', 'scripts', 'emit-schema.js');
const committed = join(gatewayRoot, 'src', 'schema.gql');

if (!existsSync(distEmit)) {
  console.error(
    `[schema:check] ${distEmit} not found.\n` +
      `Build the gateway first: pnpm --filter @shop/api-gateway run build`,
  );
  process.exit(2);
}
if (!existsSync(committed)) {
  console.error(`[schema:check] Committed SDL missing at ${committed}`);
  process.exit(2);
}

const tmp = mkdtempSync(join(tmpdir(), 'shop-schema-'));
const generated = join(tmp, 'schema.gql');

try {
  const emit = spawnSync(process.execPath, [distEmit], {
    cwd: gatewayRoot,
    env: { ...process.env, SCHEMA_OUT: generated, NODE_ENV: 'development' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (emit.status !== 0) {
    console.error(`[schema:check] emit-schema exited with ${emit.status}`);
    process.exit(emit.status ?? 1);
  }

  const a = readFileSync(committed, 'utf8');
  const b = readFileSync(generated, 'utf8');
  if (a === b) {
    console.log('[schema:check] OK — committed SDL matches resolvers.');
    process.exit(0);
  }

  console.error('[schema:check] DRIFT detected between resolvers and committed SDL.');
  console.error('Run `pnpm --filter @shop/api-gateway run schema:emit` and commit the result.\n');
  const diff = spawnSync('diff', ['-u', committed, generated], { stdio: 'inherit' });
  process.exit(diff.status ?? 1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
