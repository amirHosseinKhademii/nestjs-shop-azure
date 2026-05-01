import { Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import IORedis, { Redis } from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

const logger = new Logger('Redis');

function createClient(url: string): Redis {
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
        const url = config.get<string>('REDIS_URL', 'redis://127.0.0.1:6379');
        return createClient(url);
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
