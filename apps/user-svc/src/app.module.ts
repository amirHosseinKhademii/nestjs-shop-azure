import { Module } from '@nestjs/common';
import { join } from 'path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
// Health checks: registers HealthCheckService + TypeOrmHealthIndicator for /health/ready
// (DB ping). Used with Kubernetes liveness vs readiness probes.
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { User } from './entities/user.entity';
import { AuthModule } from './auth/auth.module';

// apps/user-svc/src or apps/user-svc/dist → three levels up is monorepo root (stable regardless of cwd).
const monorepoRootEnv = join(__dirname, '..', '..', '..', '.env');
const userSvcEnv = join(__dirname, '..', '.env');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Load root .env FIRST so DATABASE_URL is set even when pnpm runs with cwd = apps/user-svc.
      envFilePath: [
        monorepoRootEnv,
        userSvcEnv,
        join(process.cwd(), '.env'),
        join(process.cwd(), 'apps', 'user-svc', '.env'),
      ],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const databaseUrl = config
          .get<string>('DATABASE_URL')
          ?.trim()
          .replace(/^["']|["']$/g, '');
        const sslFlag = config.get<string>('PGSSL', 'false') === 'true';
        const ssl = sslFlag ? { rejectUnauthorized: false } : false;
        const synchronize = config.get<string>('TYPEORM_SYNC', 'true') === 'true';

        // Neon (and other hosted Postgres): set DATABASE_URL from the Neon console.
        // Do not commit secrets; use .env locally and secrets in production.
        if (databaseUrl) {
          // If the URL already sets sslmode= or targets Neon, let the driver parse TLS from the URL only.
          // Adding TypeORM `ssl` on top duplicates config and can trigger pg forward-compat warnings.
          const tlsFromUrl = /sslmode=/i.test(databaseUrl) || /\.neon\.tech\b/i.test(databaseUrl);
          return {
            type: 'postgres',
            url: databaseUrl,
            entities: [User],
            synchronize,
            ...(tlsFromUrl ? {} : sslFlag ? { ssl } : {}),
          };
        }

        // Local / Azure Flexible Server: discrete env vars.
        return {
          type: 'postgres',
          host: config.get<string>('PGHOST', 'localhost'),
          port: Number(config.get<string>('PGPORT', '5432')),
          username: config.get<string>('PGUSER', 'postgres'),
          password: config.get<string>('PGPASSWORD', 'postgres'),
          database: config.get<string>('USER_DB', 'user_app'),
          entities: [User],
          synchronize,
          ssl: sslFlag ? ssl : false,
        };
      },
    }),
    // Enables Terminus health endpoints in HealthController (/health/live, /health/ready).
    TerminusModule,
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
