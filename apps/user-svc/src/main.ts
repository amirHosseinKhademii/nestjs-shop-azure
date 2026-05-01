import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { correlationIdMiddleware } from './middleware/correlation-id.middleware';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  try {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      bufferLogs: true,
    });
    const logLevels =
      process.env.NODE_ENV === 'production'
        ? (['error', 'warn', 'log'] as const)
        : (['error', 'warn', 'log', 'debug', 'verbose'] as const);
    app.useLogger([...logLevels]);

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

    const port = Number(process.env.PORT ?? 3001);
    await app.listen(port, '0.0.0.0');
    logger.log(`Listening on ${await app.getUrl()}`);
  } catch (err) {
    logger.error(err instanceof Error ? err.stack : String(err));
    process.exit(1);
  }
}

void bootstrap();
