#!/usr/bin/env node
/**
 * Generic OpenAPI downloader used by contract packages.
 *
 * Example:
 *   node scripts/openapi/pull-openapi.mjs --url http://127.0.0.1:3001 --out packages/user-svc-contract/openapi/user-svc.openapi.json
 *
 * Expects the service to expose GET /openapi/v1.json.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function parseArgs(argv) {
  const args = { url: '', out: '' };
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--url' && argv[i + 1]) args.url = argv[++i];
    else if (v === '--out' && argv[i + 1]) args.out = argv[++i];
  }
  if (!args.url || !args.out) {
    console.error('Usage: node scripts/openapi/pull-openapi.mjs --url <baseUrl> --out <relativePath>');
    process.exit(2);
  }
  return { url: args.url.replace(/\/$/, ''), out: args.out };
}

const { url, out } = parseArgs(process.argv);
const docUrl = `${url}/openapi/v1.json`;
const outPath = path.resolve(repoRoot, out);

const res = await fetch(docUrl);
if (!res.ok) {
  console.error(`Failed to fetch OpenAPI document: ${res.status} ${res.statusText}`);
  console.error(`  GET ${docUrl}`);
  process.exit(1);
}

const json = await res.json();
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
console.log(`Wrote ${path.relative(repoRoot, outPath)}`);

