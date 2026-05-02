import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ObservabilityModule } from '@shop/observability';
import { TypeOrmModule } from '@nestjs/typeorm';
// Health checks: registers HealthCheckService + TypeOrmHealthIndicator for /health/ready
// (DB ping). Used with Kubernetes liveness vs readiness probes.
import { TerminusModule } from '@nestjs/terminus';
import { buildPostgresTypeOrmOptions, resolveServiceEnvFiles } from '@shop/shared';
import { HealthController } from './health.controller';
import { User } from './entities/user.entity';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveServiceEnvFiles(__dirname, 'user-svc'),
    }),
    ObservabilityModule.forRoot({ serviceName: 'user-svc' }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildPostgresTypeOrmOptions(config, {
          entities: [User],
          defaultDb: 'user_app',
          dbEnvVar: 'USER_DB',
        }),
    }),
    // Enables Terminus health endpoints in HealthController (/health/live, /health/ready).
    TerminusModule,
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
