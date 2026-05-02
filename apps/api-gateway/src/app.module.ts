import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ObservabilityModule } from '@shop/observability';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';
import { AuthResolver } from './graphql/auth.resolver';
import { ShopResolver } from './graphql/shop.resolver';
import { OrderResolver } from './graphql/order.resolver';
import { BackendHttpService } from './backend-http.service';
import { GqlJwtGuard } from './graphql/gql-jwt.guard';
import { GqlThrottlerGuard } from './graphql/gql-throttler.guard';
import {
  pickCorrelationId,
  type ApolloContextFactoryArgs,
  type GatewayGraphqlContext,
} from './graphql/graphql-context';
import { HealthController } from './health.controller';

const monorepoRootEnv = join(__dirname, '..', '..', '..', '.env');
const apiGatewayEnv = join(__dirname, '..', '.env');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        monorepoRootEnv,
        apiGatewayEnv,
        join(process.cwd(), '.env'),
        join(process.cwd(), 'apps', 'api-gateway', '.env'),
      ],
    }),
    ObservabilityModule.forRoot({ serviceName: 'api-gateway' }),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get<string>('NODE_ENV') === 'production';
        return {
          // In dev, drop the SDL next to the source so codegen / IDE tooling
          // can pick it up. In prod the rootfs is read-only (k8s
          // securityContext.readOnlyRootFilesystem), so write to /tmp which
          // is mounted as an emptyDir. Apollo only needs this file at boot.
          autoSchemaFile: isProd ? '/tmp/schema.gql' : join(process.cwd(), 'src/schema.gql'),
          sortSchema: true,
          debug: !isProd,
          playground: !isProd,
          introspection: !isProd,
          context: ({ req, res }: ApolloContextFactoryArgs): GatewayGraphqlContext => ({
            req: req as GatewayGraphqlContext['req'],
            res,
            correlationId: pickCorrelationId(req),
          }),
        };
      },
    }),
    HttpModule.register({ timeout: 15000 }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET', 'dev-secret-change-me'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES', '15m') },
      }),
    }),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.RATE_LIMIT_TTL_SEC ?? 60) * 1000,
        limit: Number(process.env.RATE_LIMIT_MAX ?? 120),
      },
    ]),
  ],
  controllers: [HealthController],
  providers: [
    AuthResolver,
    ShopResolver,
    OrderResolver,
    BackendHttpService,
    GqlJwtGuard,
    { provide: APP_GUARD, useClass: GqlThrottlerGuard },
  ],
})
export class AppModule {}
