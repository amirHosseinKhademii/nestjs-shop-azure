#!/bin/sh
# Creates repo-root .env and apps/user-svc/.env from examples if missing.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
else
  echo ".env already exists — skipped"
fi
if [ ! -f apps/user-svc/.env ]; then
  cp apps/user-svc/.env.example apps/user-svc/.env
  echo "Created apps/user-svc/.env from apps/user-svc/.env.example"
else
  echo "apps/user-svc/.env already exists — skipped"
fi
echo "Next: set DATABASE_URL in .env or apps/user-svc/.env (Neon pooled URL ends in /neondb)."
