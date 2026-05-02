#!/usr/bin/env node
// Idempotently creates the `shop-app-secrets` Secret in the `shop` namespace
// from the values in the workspace root .env. Mirrors what
// .github/workflows/cd.yml#seed-secrets does in CI, but for a local Minikube
// (or any kubectl context the developer already has set).
//
// Usage:
//   ./infra/local/minikube-overlay/seed-secrets.mjs
//   # or:
//   node ./infra/local/minikube-overlay/seed-secrets.mjs
//
// Why Node and not bash:
//   `set -a; source .env` (the obvious bash approach) silently truncates any
//   unquoted value that contains a shell metacharacter — most commonly `&` in
//   MongoDB / Postgres connection strings. The Node parser below is a small,
//   self-contained port of the dotenv grammar; it has no shell semantics, so
//   `MONGO_URI=...&w=majority&appName=Main` works whether quoted or not.
//
// Requirements:
//   • Node >= 18 (uses node:fs/promises + execFileSync)
//   • kubectl on PATH, pointed at the cluster you want to seed
//   • A `.env` at the repo root with at least DATABASE_URL, MONGO_URI,
//     REDIS_URL, JWT_SECRET. Any KAFKA_* / SERVICEBUS_* keys present are
//     forwarded too; missing optional keys are silently skipped.

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');
const ENV_FILE = resolve(REPO_ROOT, '.env');
const NAMESPACE = process.env.NAMESPACE ?? 'shop';
const SECRET_NAME = process.env.SECRET_NAME ?? 'shop-app-secrets';
const NAMESPACE_MANIFEST = resolve(REPO_ROOT, 'infra/k8s/namespace.yaml');

const REQUIRED = ['DATABASE_URL', 'MONGO_URI', 'REDIS_URL', 'JWT_SECRET'];
const OPTIONAL = [
  'SERVICEBUS_CONNECTION_STRING',
  'KAFKA_BROKERS',
  'KAFKA_USERNAME',
  'KAFKA_PASSWORD',
  'KAFKA_SSL_CA',
  'KAFKA_SSL_CERT',
  'KAFKA_SSL_KEY',
  'KAFKA_TOPIC',
  'KAFKA_GROUP_ID',
];

// Parses a .env file the way dotenv does — handles unquoted values, "..."
// (multi-line ok, \n / \" escapes), and '...' (literal). Lines starting with
// `#` (or blank) are skipped. Returns an object with raw values; callers must
// decide what to do with empty strings.
function parseDotenv(src) {
  const out = {};
  const re =
    /^\s*(?:export\s+)?([\w.-]+)\s*=\s*("(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'|[^\r\n#]*)?\s*(?:#.*)?$/gm;

  let m;
  while ((m = re.exec(src)) !== null) {
    const key = m[1];
    let val = (m[2] ?? '').trim();
    if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
      val = val
        .slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    } else if (val.startsWith("'") && val.endsWith("'") && val.length >= 2) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function die(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

if (!existsSync(ENV_FILE)) {
  die(
    `No .env at ${ENV_FILE} — copy infra/k8s/secrets.example.yaml or fill in your own.`,
  );
}

const env = parseDotenv(readFileSync(ENV_FILE, 'utf8'));

const missing = REQUIRED.filter((k) => !env[k]);
if (missing.length) {
  die(
    `Missing required keys in .env: ${missing.join(', ')}\n` +
      `   (Tip: values containing & ; ? ( ) | < > or whitespace must be wrapped in "double quotes".)`,
  );
}

const currentContext = execFileSync('kubectl', ['config', 'current-context'], {
  encoding: 'utf8',
}).trim();
console.log(`→ Target context: ${currentContext}`);
console.log(`→ Namespace:      ${NAMESPACE}`);
console.log(`→ Secret:         ${SECRET_NAME}`);

try {
  execFileSync('kubectl', ['get', 'namespace', NAMESPACE], {
    stdio: 'ignore',
  });
} catch {
  console.log(`→ Creating namespace from ${NAMESPACE_MANIFEST}`);
  execFileSync('kubectl', ['apply', '-f', NAMESPACE_MANIFEST], {
    stdio: 'inherit',
  });
}

const fromLiteralArgs = [];
for (const k of REQUIRED) {
  fromLiteralArgs.push(`--from-literal=${k}=${env[k]}`);
}

const included = [];
for (const k of OPTIONAL) {
  if (env[k]) {
    fromLiteralArgs.push(`--from-literal=${k}=${env[k]}`);
    included.push(k);
  }
}

console.log(
  included.length > 0
    ? `→ Optional keys:  ${included.join(', ')}`
    : `→ Optional keys:  (none — checkout will use HTTP fallback)`,
);

const yaml = execFileSync(
  'kubectl',
  [
    'create',
    'secret',
    'generic',
    SECRET_NAME,
    '--namespace',
    NAMESPACE,
    ...fromLiteralArgs,
    '--dry-run=client',
    '-o',
    'yaml',
  ],
  { encoding: 'utf8' },
);

execFileSync('kubectl', ['apply', '-f', '-'], {
  input: yaml,
  stdio: ['pipe', 'inherit', 'inherit'],
});

console.log(`✅ ${SECRET_NAME} applied to ${NAMESPACE}`);
