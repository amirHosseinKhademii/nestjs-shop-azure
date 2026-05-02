// Installs the three Aiven PEM blobs (ca.pem / service.cert / service.key)
// into the corresponding KAFKA_SSL_* keys of the workspace `.env`.
//
//   node scripts/install-kafka-pems.mjs                       # uses ~/Downloads/{ca.pem,service.cert,service.key}
//   node scripts/install-kafka-pems.mjs <ca> <cert> <key>     # explicit paths
//
// Always writes a timestamped `.env.bak.<ts>` next to `.env` first.
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const home = homedir();
const caPath = args[0] ?? resolve(home, 'Downloads/ca.pem');
const certPath = args[1] ?? resolve(home, 'Downloads/service.cert');
const keyPath = args[2] ?? resolve(home, 'Downloads/service.key');
const envPath = resolve(process.cwd(), '.env');

for (const p of [caPath, certPath, keyPath, envPath]) {
  if (!existsSync(p)) {
    console.error(`Missing file: ${p}`);
    process.exit(1);
  }
}

const ca = readFileSync(caPath, 'utf8').replace(/\r\n/g, '\n').trimEnd();
const cert = readFileSync(certPath, 'utf8').replace(/\r\n/g, '\n').trimEnd();
const key = readFileSync(keyPath, 'utf8').replace(/\r\n/g, '\n').trimEnd();

const expect = {
  KAFKA_SSL_CA: { value: ca, marker: 'BEGIN CERTIFICATE' },
  KAFKA_SSL_CERT: { value: cert, marker: 'BEGIN CERTIFICATE' },
  KAFKA_SSL_KEY: { value: key, marker: 'BEGIN ' /* matches PRIVATE / RSA PRIVATE / EC PRIVATE */ },
};
for (const [k, { value, marker }] of Object.entries(expect)) {
  if (!value.includes(marker)) {
    console.error(`${k}: source file at ${k === 'KAFKA_SSL_CA' ? caPath : k === 'KAFKA_SSL_CERT' ? certPath : keyPath} is missing "${marker}" marker`);
    process.exit(1);
  }
}
if (!key.match(/-----BEGIN [A-Z ]*PRIVATE KEY-----/)) {
  console.error(`KAFKA_SSL_KEY: ${keyPath} does not look like a PRIVATE KEY (first line: ${key.split('\n')[0]})`);
  process.exit(1);
}

const env = readFileSync(envPath, 'utf8');

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backup = `${envPath}.bak.${ts}`;
copyFileSync(envPath, backup);
console.log(`Backup written: ${backup}`);

function replaceBlock(src, key, value) {
  // Match: KAFKA_KEY="..."  where the opening " is on the same line as the
  // KAFKA_KEY= and the value continues until the next standalone closing ".
  // We accept both single-line ("..."\n) and multi-line forms.
  const re = new RegExp(
    `^${key}="[\\s\\S]*?(?<!\\\\)"\\s*$`,
    'm',
  );
  const replacement = `${key}="${value}"`;
  if (!re.test(src)) {
    throw new Error(
      `Could not find a quoted block for ${key} in .env. Make sure the file currently has a line starting with ${key}=" .`,
    );
  }
  return src.replace(re, replacement);
}

let next = env;
for (const [k, { value }] of Object.entries(expect)) {
  next = replaceBlock(next, k, value);
}

writeFileSync(envPath, next);
console.log(`Updated ${envPath}`);

console.log('\nNext: re-validate with `node scripts/check-kafka-pems.mjs`');
