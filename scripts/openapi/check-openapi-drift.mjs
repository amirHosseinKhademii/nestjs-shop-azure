#!/usr/bin/env node
/**
 * CI-safe OpenAPI drift check.
 *
 * Regenerates contract TS types from the checked-in OpenAPI JSON and fails if
 * the working tree changes. This prevents the gateway/contracts from drifting.
 *
 * Notes:
 * - Does NOT pull from running services (CI-friendly).
 * - Assumes the repo is clean when invoked.
 */

import { spawnSync } from 'node:child_process';

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: 'inherit' });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

// Re-generate TS types from checked-in OpenAPI JSON.
run('pnpm', ['--filter', '@shop/user-svc-contract', 'run', 'codegen']);
run('pnpm', ['--filter', '@shop/shop-svc-contract', 'run', 'codegen']);
run('pnpm', ['--filter', '@shop/order-svc-contract', 'run', 'codegen']);
run('pnpm', ['--filter', '@shop/task-svc-contract', 'run', 'codegen']);

// Fail if any contract output changed.
run('git', [
  'diff',
  '--exit-code',
  '--',
  'packages/*-svc-contract/openapi',
  'packages/*-svc-contract/src/generated',
]);

