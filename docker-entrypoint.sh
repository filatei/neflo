#!/bin/sh
# Sync the schema to the database, then start the standalone Next.js server.
# We use `db push` (no migration history yet); it's idempotent and only applies
# the diff. Switch to `migrate deploy` once a prisma/migrations/ history exists.
set -e

echo "[neflo] syncing database schema..."
node node_modules/prisma/build/index.js db push --skip-generate || {
  echo "[neflo] prisma db push failed" >&2
  exit 1
}

echo "[neflo] starting server on :${PORT:-3000}"
exec node server.js
