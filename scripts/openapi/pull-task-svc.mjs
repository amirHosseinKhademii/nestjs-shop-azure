#!/usr/bin/env node
/**
 * Backwards-compatible task-svc pull script.
 *
 * Prefer: `node scripts/openapi/pull-openapi.mjs --url ... --out ...`
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function parseArgs(argv) {
  let url = 'http://127.0.0.1:3004';
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--url' && argv[i + 1]) url = argv[++i];
  }
  return { url: url.replace(/\/$/, '') };
}

const { url } = parseArgs(process.argv);
const out = 'packages/task-svc-contract/openapi/task-svc.openapi.json';

const child = spawn(
  process.execPath,
  [path.join(__dirname, 'pull-openapi.mjs'), '--url', url, '--out', out],
  { stdio: 'inherit', cwd: repoRoot },
);
child.on('exit', (code) => process.exit(code ?? 1));
