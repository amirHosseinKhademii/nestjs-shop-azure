import { Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import IORedis, { Redis } from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

const logger = new Logger('Redis');

const ALLOWED_PROTOCOLS = ['redis:', 'rediss:'] as const;

/**
 * Fail-fast validation for `REDIS_URL`.
 *
 * Catches the misconfigurations that otherwise surface as opaque per-request
 * `MaxRetriesPerRequestError`s ~14 s into the request — by then the upstream
 * caller has already timed out and the actual cause (bad scheme, a stray
 * `redis-cli ...` command pasted into the secret, missing host) is buried
 * deep in shop-svc logs. We'd rather crash the pod at boot with one clear line
 * so it shows up as `CrashLoopBackOff` and the operator sees the reason
 * immediately in `kubectl describe pod`.
 *
 * Also returns a normalized URL (trimmed) and the parsed object so the caller
 * doesn't need to parse twice.
 *
 * Errors here intentionally do not include the raw URL — it almost always
 * contains a password.
 */
export function validateRedisUrl(rawUrl: string): { url: string; parsed: URL } {
  const trimmed = (rawUrl ?? '').trim();
  if (!trimmed) {
    throw new Error('REDIS_URL is empty. Set it to redis://… or rediss://….');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      'REDIS_URL is not a valid URL. Expected redis://[user:pass@]host:port ' +
        '(or rediss:// for TLS). If you copied an example like ' +
        '`redis-cli --tls -u redis://...`, paste only the redis://… part.',
    );
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol as (typeof ALLOWED_PROTOCOLS)[number])) {
    throw new Error(
      `REDIS_URL uses unsupported scheme "${parsed.protocol}" — must be redis:// or rediss://.`,
    );
  }

  if (!parsed.hostname) {
    throw new Error('REDIS_URL is missing a hostname.');
  }

  if (parsed.protocol === 'redis:' && parsed.password) {
    logger.warn(
      `REDIS_URL uses plain redis:// with a password to ${parsed.hostname}. ` +
        'Most managed providers (Upstash, Redis Cloud, ElastiCache w/ encryption) ' +
        'require TLS — switch to rediss:// if you see WRONGPASS or "Connection is closed".',
    );
  }

  return { url: trimmed, parsed };
}

function createClient(url: string, parsed: URL): Redis {
  logger.log(
    `Connecting to Redis at ${parsed.protocol}//${parsed.hostname}:${parsed.port || '6379'}`,
  );

  const client = new IORedis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    connectionName: 'shop-svc',
    retryStrategy: (times) => Math.min(1000 * 2 ** times, 30_000),
    reconnectOnError: () => true,
  });

  let lastErrorMessage = '';
  client.on('error', (err: Error) => {
    if (err.message !== lastErrorMessage) {
      lastErrorMessage = err.message;
      logger.error(`Redis client error: ${err.message}`);
    }
  });
  client.on('ready', () => {
    lastErrorMessage = '';
    logger.log('Redis ready');
  });
  client.on('end', () => logger.warn('Redis connection ended'));

  return client;
}

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const raw = config.get<string>('REDIS_URL', 'redis://127.0.0.1:6379');
        const { url, parsed } = validateRedisUrl(raw);
        return createClient(url, parsed);
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(private readonly moduleRef: ModuleRef) {}

  async onApplicationShutdown(): Promise<void> {
    const client = this.moduleRef.get<Redis>(REDIS_CLIENT, { strict: false });
    if (!client) return;
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }
}
