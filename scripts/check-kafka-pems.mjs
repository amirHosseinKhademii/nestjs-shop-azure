// Local-only diagnostic. Loads .env, then asks Node's OpenSSL to parse each
// PEM blob individually and reports which one (if any) is malformed.
// Run with: node scripts/check-kafka-pems.mjs
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import crypto from 'node:crypto';
import tls from 'node:tls';

function loadEnv(file) {
  const raw = readFileSync(file, 'utf8');
  const out = {};
  let i = 0;
  const lines = raw.split('\n');
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) { i++; continue; }
    const key = m[1];
    let val = m[2];
    if (val.startsWith('"')) {
      val = val.slice(1);
      if (val.endsWith('"')) {
        val = val.slice(0, -1);
        i++;
      } else {
        i++;
        const buf = [val];
        while (i < lines.length) {
          const next = lines[i];
          if (next.endsWith('"')) {
            buf.push(next.slice(0, -1));
            i++;
            break;
          }
          buf.push(next);
          i++;
        }
        val = buf.join('\n');
      }
    } else {
      i++;
    }
    out[key] = val;
  }
  return out;
}

const envFile = resolve(process.cwd(), '.env');
console.log('Reading', envFile);
const env = loadEnv(envFile);

function fingerprint(label, val) {
  if (!val) return console.log(`${label}: <missing>`);
  const len = val.length;
  const lines = val.split('\n');
  const first = lines[0];
  const last = lines.filter((l) => l.length > 0).at(-1);
  const indented = lines.some((l) => /^[ \t]+\S/.test(l));
  const crlf = val.includes('\r');
  const blanks = lines.filter((l) => l.trim() === '').length;
  console.log(
    `${label}: len=${len} lines=${lines.length} blanks=${blanks} indented=${indented} crlf=${crlf}`,
  );
  console.log(`  first: ${first}`);
  console.log(`  last : ${last}`);
}

console.log('\n── PEM fingerprints ──');
fingerprint('KAFKA_SSL_CA  ', env.KAFKA_SSL_CA);
fingerprint('KAFKA_SSL_CERT', env.KAFKA_SSL_CERT);
fingerprint('KAFKA_SSL_KEY ', env.KAFKA_SSL_KEY);

console.log('\n── OpenSSL parse attempts ──');

function tryParse(name, fn) {
  try {
    fn();
    console.log(`${name}: OK`);
  } catch (e) {
    console.log(`${name}: FAIL — ${e.code || ''} ${e.message}`);
  }
}

tryParse('CA  certificate parse', () => {
  new crypto.X509Certificate(env.KAFKA_SSL_CA);
});
tryParse('CERT certificate parse', () => {
  new crypto.X509Certificate(env.KAFKA_SSL_CERT);
});
tryParse('KEY  private key parse', () => {
  crypto.createPrivateKey({ key: env.KAFKA_SSL_KEY, format: 'pem' });
});
tryParse('Combined SecureContext (what kafkajs builds)', () => {
  tls.createSecureContext({
    ca: env.KAFKA_SSL_CA,
    cert: env.KAFKA_SSL_CERT,
    key: env.KAFKA_SSL_KEY,
  });
});
