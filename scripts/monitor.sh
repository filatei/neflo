#!/usr/bin/env bash
# Neflo ops helper. Run on the server.
#   monitor.sh status            one-shot health snapshot
#   monitor.sh logs [service]    follow logs (app|postgres)
#   monitor.sh errors            grep recent logs for errors
#   monitor.sh scan              trigger a deposit scan now
#   monitor.sh restart [service] recreate containers
#   monitor.sh pull              pull latest image + roll
#   monitor.sh timer             show the scan timer status
set -euo pipefail

APP_DIR="/opt/neflo/app"
PORTS_FILE="/opt/neflo/.env.ports"
cd "$APP_DIR"
DC="docker compose --env-file ../.env.ports --env-file ./.env"
PORT="$(grep -E '^APP_PORT=' "$PORTS_FILE" | cut -d= -f2)"

case "${1:-status}" in
  status)
    $DC ps
    echo
    curl -sS -o /dev/null -w "app  http://127.0.0.1:${PORT}  -> %{http_code}\n" \
      "http://127.0.0.1:${PORT}" || echo "app not responding on ${PORT}"
    ;;
  logs)
    $DC logs -f --tail=100 ${2:-}
    ;;
  errors)
    $DC logs --tail=500 2>&1 | grep -iE 'error|exception|fatal|⨯|denied' \
      || echo "no errors in last 500 log lines"
    ;;
  scan)
    ./scripts/scan-tick.sh && echo "scan triggered"
    ;;
  restart)
    $DC up -d --force-recreate ${2:-}
    ;;
  pull)
    $DC pull && $DC up -d --no-build --remove-orphans && docker image prune -f
    ;;
  timer)
    systemctl status neflo-scan.timer --no-pager || true
    echo
    journalctl -u neflo-scan.service -n 20 --no-pager || true
    ;;
  *)
    echo "usage: monitor.sh {status|logs [svc]|errors|scan|restart [svc]|pull|timer}"
    exit 1
    ;;
esac
