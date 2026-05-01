import { join } from 'path';

/**
 * Returns the candidate `.env` file paths for a Nest service in this monorepo,
 * in priority order. Pass into `ConfigModule.forRoot({ envFilePath: ... })`.
 *
 * The list covers both `cwd = monorepo root` and `cwd = apps/<svc>` so it
 * doesn't matter where pnpm runs from.
 *
 * @param dirname  Pass `__dirname` from the consumer's `app.module.ts`.
 *                 We resolve `<dirname>/../../../.env` (monorepo root) and
 *                 `<dirname>/../.env` (service folder) from there.
 * @param svcDir   Service folder name, e.g. `user-svc` / `order-svc`.
 *                 Used to construct `process.cwd()/apps/<svcDir>/.env`.
 */
export function resolveServiceEnvFiles(dirname: string, svcDir: string): string[] {
  return [
    join(dirname, '..', '..', '..', '.env'),
    join(dirname, '..', '.env'),
    join(process.cwd(), '.env'),
    join(process.cwd(), 'apps', svcDir, '.env'),
  ];
}
