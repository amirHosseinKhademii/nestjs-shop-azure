import { Kafka, type KafkaConfig, type SASLOptions, logLevel } from 'kafkajs';

// Builds a Kafka client from environment, returning undefined when KAFKA_BROKERS
// is not set so callers can transparently fall back to another transport.
//
// Authentication modes (Aiven supports both — pick one):
//
//   1. mTLS (Aiven's default):
//        KAFKA_SSL_CA   = CA certificate PEM
//        KAFKA_SSL_CERT = client "Access Certificate" PEM
//        KAFKA_SSL_KEY  = client "Access Key" PEM
//      Leave KAFKA_USERNAME / KAFKA_PASSWORD unset.
//
//   2. SASL/SCRAM (must be enabled in the Aiven console):
//        KAFKA_SSL_CA    = CA certificate PEM
//        KAFKA_USERNAME  = avnadmin
//        KAFKA_PASSWORD  = <from console>
//        KAFKA_SASL_MECHANISM = scram-sha-256 | scram-sha-512 | plain (default scram-sha-256)
//
// For a plaintext local broker (Redpanda / dev) set KAFKA_SSL=false and leave
// every cert/SASL var empty.
export function buildKafkaClient(clientId: string): Kafka | undefined {
  const brokers = process.env.KAFKA_BROKERS;
  if (!brokers) return undefined;

  const config: KafkaConfig = {
    clientId,
    brokers: brokers
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean),
    ssl: buildSsl(),
    logLevel: logLevel.WARN,
  };

  const sasl = buildSasl();
  if (sasl) config.sasl = sasl;

  return new Kafka(config);
}

function buildSsl(): KafkaConfig['ssl'] {
  if (process.env.KAFKA_SSL === 'false') return false;

  const ca = process.env.KAFKA_SSL_CA;
  const cert = process.env.KAFKA_SSL_CERT;
  const key = process.env.KAFKA_SSL_KEY;

  // No CA bundle → use Node's default trust store (works for managed brokers
  // that present a public CA, fails fast for Aiven which uses its own root).
  if (!ca) return true;

  return {
    ca: [ca],
    rejectUnauthorized: true,
    // Optional client cert — present for Aiven's default mTLS auth, absent
    // when SASL is in use. kafkajs simply ignores undefined fields.
    ...(cert ? { cert } : {}),
    ...(key ? { key } : {}),
  };
}

function buildSasl(): SASLOptions | undefined {
  const username = process.env.KAFKA_USERNAME;
  const password = process.env.KAFKA_PASSWORD;
  if (!username || !password) return undefined;

  // SASLOptions is a discriminated union keyed on `mechanism`, so we narrow
  // explicitly here rather than assigning a wider string type.
  const mechanism = (process.env.KAFKA_SASL_MECHANISM ?? 'scram-sha-256').toLowerCase();
  switch (mechanism) {
    case 'plain':
      return { mechanism: 'plain', username, password };
    case 'scram-sha-512':
      return { mechanism: 'scram-sha-512', username, password };
    case 'scram-sha-256':
    default:
      return { mechanism: 'scram-sha-256', username, password };
  }
}
