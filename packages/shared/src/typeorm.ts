import type { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';

export interface BuildPostgresOptions {
  /** TypeORM entities for this service. */
  entities: EntityClassOrSchema[];
  /**
   * DB name fallback when DATABASE_URL is not set and discrete env vars are used.
   * e.g. `user_app`, `order_app`.
   */
  defaultDb: string;
  /** Env var that holds the discrete DB name override (e.g. `USER_DB`, `ORDER_DB`). */
  dbEnvVar: string;
}

/**
 * Returns a Postgres TypeOrmModuleOptions object from environment.
 *
 * Two modes:
 *  - **Hosted** — `DATABASE_URL` set (Neon, Azure Flexible Server). TLS is detected
 *    from the URL (`sslmode=`, `*.neon.tech`); otherwise `PGSSL=true` adds it.
 *  - **Discrete** — falls back to `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` /
 *    `<dbEnvVar>` (default `localhost:5432 / postgres / postgres / <defaultDb>`).
 *
 * Common knobs:
 *  - `TYPEORM_SYNC=true|false` — auto-sync schema (true OK for demos, false in prod).
 *  - `PGSSL=true` — force TLS when the URL/host doesn't already imply it.
 */
export function buildPostgresTypeOrmOptions(
  config: ConfigService,
  opts: BuildPostgresOptions,
): TypeOrmModuleOptions {
  const databaseUrl = config
    .get<string>('DATABASE_URL')
    ?.trim()
    .replace(/^["']|["']$/g, '');
  const sslFlag = config.get<string>('PGSSL', 'false') === 'true';
  const ssl = sslFlag ? { rejectUnauthorized: false } : false;
  const synchronize = config.get<string>('TYPEORM_SYNC', 'true') === 'true';
  const entities = opts.entities;

  if (databaseUrl) {
    const tlsFromUrl = /sslmode=/i.test(databaseUrl) || /\.neon\.tech\b/i.test(databaseUrl);
    return {
      type: 'postgres',
      url: databaseUrl,
      entities,
      synchronize,
      ...(tlsFromUrl ? {} : sslFlag ? { ssl } : {}),
    };
  }

  return {
    type: 'postgres',
    host: config.get<string>('PGHOST', 'localhost'),
    port: Number(config.get<string>('PGPORT', '5432')),
    username: config.get<string>('PGUSER', 'postgres'),
    password: config.get<string>('PGPASSWORD', 'postgres'),
    database: config.get<string>(opts.dbEnvVar, opts.defaultDb),
    entities,
    synchronize,
    ssl: sslFlag ? ssl : false,
  };
}
