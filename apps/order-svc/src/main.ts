import { registerTracing, correlationIdMiddleware } from '@shop/observability';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

registerTracing('order-svc');

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const usePino = process.env.LOG_FORMAT === 'json' || process.env.OBS_ENABLED === 'true';
  try {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      bufferLogs: usePino,
      ...(!usePino
        ? {
            logger:
              process.env.NODE_ENV === 'production'
                ? (['error', 'warn', 'log'] as const)
                : (['error', 'warn', 'log', 'debug', 'verbose'] as const),
          }
        : {}),
    });
    if (usePino) {
      const { Logger: PinoLogger } = await import('nestjs-pino');
      app.useLogger(app.get(PinoLogger));
    }

    const trustProxy = process.env.TRUST_PROXY !== '0';
    app.set('trust proxy', trustProxy ? 1 : false);

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

    const port = Number(process.env.PORT ?? 3003);
    await app.listen(port, '0.0.0.0');
    logger.log(`Listening on ${await app.getUrl()}`);
  } catch (err) {
    logger.error(err instanceof Error ? err.stack : String(err));
    process.exit(1);
  }
}

void bootstrap();
