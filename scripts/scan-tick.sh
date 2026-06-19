#!/usr/bin/env bash
# One deposit-scan tick. Invoked by the neflo-scan systemd timer.
# Reads the app port and internal secret from the deployed config and pings the
# loopback scan endpoint (never leaves the box).
set -euo pipefail

APP_DIR="/opt/neflo/app"
PORTS_FILE="/opt/neflo/.env.ports"

PORT="$(grep -E '^APP_PORT=' "$PORTS_FILE" | cut -d= -f2)"
SECRET="$(grep -E '^INTERNAL_SECRET=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2- || true)"

curl -fsS --max-time 50 -X POST \
  -H "X-Internal-Secret: ${SECRET}" \
  "http://127.0.0.1:${PORT}/api/internal/scan" >/dev/null
