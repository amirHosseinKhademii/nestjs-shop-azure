// Idempotently creates the Kafka topic referenced by .env (KAFKA_TOPIC) on
// the cluster reachable via KAFKA_BROKERS. Uses the mTLS credentials already
// stored in .env so there's nothing extra to wire up.
//
//   node scripts/ensure-kafka-topic.mjs
//
// Aiven free-tier defaults to 2 partitions max and replication factor 2.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Kafka, logLevel } from 'kafkajs';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Repo root is one level up from `scripts/`.
const repoRoot = resolve(__dirname, '..');

function parseEnv(file) {
  const raw = readFileSync(file, 'utf8');
  const out = {};
  let i = 0;
  const lines = raw.split('\n');
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) {
      i++;
      continue;
    }
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
    out[m[1]] = val;
  }
  return out;
}

const env = parseEnv(resolve(repoRoot, '.env'));

const brokers = env.KAFKA_BROKERS;
if (!brokers) {
  console.error('KAFKA_BROKERS not set in .env');
  process.exit(1);
}
const topic = env.KAFKA_TOPIC ?? 'checkout-events';
const partitions = Number(process.env.KAFKA_TOPIC_PARTITIONS ?? 2);
const replicationFactor = Number(process.env.KAFKA_TOPIC_REPLICATION ?? 2);

const ssl = env.KAFKA_SSL_CA
  ? {
      ca: [env.KAFKA_SSL_CA],
      rejectUnauthorized: true,
      ...(env.KAFKA_SSL_CERT ? { cert: env.KAFKA_SSL_CERT } : {}),
      ...(env.KAFKA_SSL_KEY ? { key: env.KAFKA_SSL_KEY } : {}),
    }
  : true;

const sasl =
  env.KAFKA_USERNAME && env.KAFKA_PASSWORD
    ? {
        mechanism: (env.KAFKA_SASL_MECHANISM ?? 'scram-sha-256').toLowerCase(),
        username: env.KAFKA_USERNAME,
        password: env.KAFKA_PASSWORD,
      }
    : undefined;

const kafka = new Kafka({
  clientId: 'topic-bootstrap',
  brokers: brokers.split(',').map((b) => b.trim()),
  ssl,
  ...(sasl ? { sasl } : {}),
  logLevel: logLevel.ERROR,
});

const admin = kafka.admin();

try {
  await admin.connect();
  console.log(`Connected to ${brokers}`);

  const existing = await admin.listTopics();
  if (existing.includes(topic)) {
    console.log(`Topic "${topic}" already exists — nothing to do`);
  } else {
    console.log(`Creating topic "${topic}" (partitions=${partitions}, replication=${replicationFactor}) ...`);
    const created = await admin.createTopics({
      validateOnly: false,
      waitForLeaders: true,
      topics: [
        {
          topic,
          numPartitions: partitions,
          replicationFactor,
        },
      ],
    });
    console.log(created ? `Topic "${topic}" created` : `Topic "${topic}" already existed (race)`);
  }

  const meta = await admin.fetchTopicMetadata({ topics: [topic] });
  for (const t of meta.topics) {
    console.log(`  ${t.name} → ${t.partitions.length} partitions`);
  }
} catch (e) {
  console.error('Topic ensure failed:', e.message);
  process.exitCode = 1;
} finally {
  await admin.disconnect();
}
