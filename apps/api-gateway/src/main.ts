import './tracing';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { correlationIdMiddleware } from './middleware/correlation-id.middleware';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const isProd = process.env.NODE_ENV === 'production';
  const logLevels = isProd
    ? (['error', 'warn', 'log'] as const)
    : (['error', 'warn', 'log', 'debug', 'verbose'] as const);
  try {
    // Don't buffer logs: if NestFactory.create() throws (e.g. a module
    // initialisation error) buffered logs are silently lost and the pod
    // appears to exit with no output at all. Pay the few extra log lines
    // for the boot sequence to keep diagnostics intact.
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: [...logLevels],
    });

    const trustProxy = process.env.TRUST_PROXY !== '0';
    app.set('trust proxy', trustProxy ? 1 : false);

    app.use(
      helmet({
        // Apollo Sandbox loads inline scripts in dev; disable CSP there so it
        // still works locally. In prod the gateway only serves /graphql which
        // is consumed by the SPA, so the strict default CSP is fine.
        contentSecurityPolicy: isProd ? undefined : false,
        crossOriginEmbedderPolicy: false,
        hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      }),
    );
    app.use(correlationIdMiddleware);
    app.enableShutdownHooks();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.enableCors({ origin: true, credentials: true });

    const port = Number(process.env.PORT ?? 3000);
    await app.listen(port, '0.0.0.0');
    logger.log(`Listening on ${await app.getUrl()}`);
  } catch (err) {
    logger.error(err instanceof Error ? err.stack : String(err));
    process.exit(1);
  }
}

void bootstrap();
