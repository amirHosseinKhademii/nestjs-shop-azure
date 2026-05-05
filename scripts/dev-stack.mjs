#!/usr/bin/env node
/**
 * Local dev stack orchestrator.
 *
 * Spawns the Nest stack (`pnpm dev:all`) and the .NET task-svc
 * (`dotnet run --project apps/task-svc`) side by side. The .NET service
 * auto-loads the repo-root `.env` at startup the same way the Nest services
 * do, so there is no Docker / no extra DB setup — just point your
 * `TASK_DATABASE_URL` at any Postgres you can reach (e.g. Neon, a local
 * Postgres install, a remote dev server) in the same `.env` you already
 * use for the rest of the stack.
 *
 * Ctrl-C cleanly stops both processes.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(repoRoot);

const RESET = '\x1b[0m';
const colors = {
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
};

const log = (msg) => process.stdout.write(`${colors.cyan}[dev-stack]${RESET} ${msg}\n`);
const warn = (msg) => process.stderr.write(`${colors.yellow}[dev-stack]${RESET} ${msg}\n`);
const fail = (msg) => {
  process.stderr.write(`${colors.red}[dev-stack] ✗ ${msg}${RESET}\n`);
  process.exit(1);
};

// ─── Prereq checks ──────────────────────────────────────────────────────────
function which(cmd) {
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
    stdio: 'ignore',
  });
  return probe.status === 0;
}

function requireTool(cmd, hint) {
  if (!which(cmd)) fail(`Missing required tool '${cmd}'. ${hint}`);
}

requireTool('pnpm', 'Install with: corepack enable && corepack prepare pnpm@9.14.2 --activate');
requireTool('dotnet', 'Install the .NET 10 SDK from https://dotnet.microsoft.com/download');

if (!existsSync(resolve(repoRoot, '.env'))) {
  warn(
    'No .env at the repo root. The Nest services need DATABASE_URL/MONGO_URI/REDIS_URL ' +
      'and task-svc needs TASK_DATABASE_URL. See apps/*/env.example for the keys each ' +
      'service expects.',
  );
}

// ─── Run services in parallel ───────────────────────────────────────────────
log('Booting Nest stack + .NET task-svc (Ctrl-C to stop)');

/**
 * Spawn a child process whose stdout/stderr lines get prefixed with `name`
 * in the chosen color. Lets us mix turbo's own multiplexed output with the
 * single-stream `dotnet run` output without losing track of who said what.
 */
function spawnLabeled({ name, color, command, args, env }) {
  const child = spawn(command, args, {
    env: { ...process.env, ...(env ?? {}), FORCE_COLOR: '1' },
    shell: false,
  });
  const tag = `${color}[${name}]${RESET} `;
  const pipe = (stream, target) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        target.write(tag + buffer.slice(0, idx + 1));
        buffer = buffer.slice(idx + 1);
      }
    });
    stream.on('end', () => {
      if (buffer.length > 0) target.write(tag + buffer + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  return child;
}

const children = [
  spawnLabeled({
    name: 'node',
    color: colors.blue,
    command: 'pnpm',
    args: ['dev:all'],
  }),
  spawnLabeled({
    name: 'task',
    color: colors.magenta,
    command: 'dotnet',
    // Lets `dotnet run` apply apps/task-svc/Properties/launchSettings.json,
    // which already sets ASPNETCORE_ENVIRONMENT=Development and binds 3004.
    args: ['run', '--project', 'apps/task-svc'],
  }),
];

// Forward Ctrl-C / SIGTERM to both children, then exit when all are gone.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`Received ${signal}, stopping services ...`);
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGINT');
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

let firstExitCode = null;
let pendingExits = children.length;
for (const child of children) {
  child.once('exit', (code, signal) => {
    pendingExits -= 1;
    const exitInfo = signal ? `signal ${signal}` : `code ${code}`;
    log(`child '${child.spawnargs[0]}' exited (${exitInfo})`);
    if (firstExitCode === null) firstExitCode = code ?? (signal ? 0 : 1);
    if (!shuttingDown && pendingExits > 0) {
      shutdown('child-exit');
    }
    if (pendingExits === 0) process.exit(firstExitCode ?? 0);
  });
}
