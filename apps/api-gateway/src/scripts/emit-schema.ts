/**
 * Headless SDL emitter.
 *
 * Bootstraps the Nest app just far enough for `@nestjs/graphql`'s code-first
 * pipeline to run, then exits. Used by:
 *   - `pnpm --filter @shop/api-gateway run schema:emit` (developer refresh)
 *   - CI drift check (compares the emitted SDL against the committed file).
 *
 * Why a separate script and not `nest start`?  `nest start` boots a live HTTP
 * server with all middleware, which is overkill here and pollutes CI logs.
 * `NestFactory.create({...}).init()` runs every `OnModuleInit` hook (which is
 * what writes `autoSchemaFile`) without ever calling `listen()`.
 */
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';

async function main(): Promise<void> {
  // Default to the in-tree dev location; CI overrides this to a tmp path so
  // the committed SDL is left untouched and can be compared after the fact.
  const outPath = resolve(process.env.SCHEMA_OUT ?? 'src/schema.gql');
  process.env.SCHEMA_OUTPUT_PATH = outPath;
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'development';

  const { AppModule } = await import('../app.module');

  const app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });
  try {
    await app.init();
  } finally {
    await app.close();
  }

  if (!existsSync(outPath)) {
    throw new Error(`Schema was not written at expected path: ${outPath}`);
  }
  console.log(`[schema:emit] Wrote ${statSync(outPath).size} bytes to ${outPath}`);
}

void main().catch((err: unknown) => {
  console.error('[schema:emit] failed:', err);
  process.exit(1);
});
