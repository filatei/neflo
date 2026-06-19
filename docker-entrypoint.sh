#!/bin/sh
# Apply pending DB migrations, then start the standalone Next.js server.
set -e

echo "[neflo] applying database migrations..."
node node_modules/prisma/build/index.js migrate deploy || {
  echo "[neflo] migrate deploy failed" >&2
  exit 1
}

echo "[neflo] starting server on :${PORT:-3000}"
exec node server.js
