#!/usr/bin/env bash
#
# Seed GitHub Actions secrets for filatei/neflo with DUMMY values.
# Pull the real values from Otuburu later and re-run (this script overwrites).
#
# Requires: gh CLI authenticated (`gh auth login`) with repo admin access.
# Usage:
#   ./scripts/github-secrets.sh                 # uses REPO default below
#   REPO=filatei/neflo ./scripts/github-secrets.sh
#
set -euo pipefail

REPO="${REPO:-filatei/neflo}"

echo "Seeding secrets on ${REPO} (dummy values) ..."

# Helper: set a secret only from an env-style KEY=VALUE pair.
set_secret() {
  local key="$1" value="$2"
  printf '%s' "$value" | gh secret set "$key" --repo "$REPO" --body - >/dev/null
  echo "  ✓ ${key}"
}

# --- Secrets that must be real randoms even in dev (don't ship a fixed dummy) ---
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
INTERNAL_SECRET="$(openssl rand -hex 32)"

# --- Core / app ---
set_secret NEXTAUTH_SECRET   "$NEXTAUTH_SECRET"
set_secret INTERNAL_SECRET   "$INTERNAL_SECRET"
set_secret NEXTAUTH_URL      "https://neflo.torama.money"
set_secret APP_URL           "https://neflo.torama.money"

# --- Database (Postgres on the same box as Otuburu) ---
set_secret DATABASE_URL      "postgresql://neflo:dummy_pw@localhost:5432/neflo?schema=public"
set_secret POSTGRES_USER     "neflo"
set_secret POSTGRES_PASSWORD "dummy_pw"
set_secret POSTGRES_DB       "neflo"

# --- Google OAuth (pull real values from Otuburu) ---
set_secret GOOGLE_CLIENT_ID     "dummy-google-client-id.apps.googleusercontent.com"
set_secret GOOGLE_CLIENT_SECRET "dummy-google-client-secret"
set_secret ADMIN_EMAILS         "filatei@gtsng.com"

# --- Email (reuse Otuburu's Google SMTP relay) ---
set_secret SMTP_HOST   "smtp.gmail.com"
set_secret SMTP_PORT   "465"
set_secret SMTP_SECURE "true"
set_secret SMTP_USER   "dummy@torama.money"
set_secret SMTP_PASS   "dummy-app-password"
set_secret SMTP_FROM   "Neflo <no-reply@torama.money>"

# --- Stablecoin rails ---
# 12-word BIP39 test vector — DUMMY ONLY. Never fund this address.
set_secret WALLET_MNEMONIC   "test test test test test test test test test test test junk"
set_secret TRONGRID_API_KEY  "dummy-trongrid-api-key"
set_secret TRON_FULL_HOST    "https://api.trongrid.io"
set_secret ETH_RPC_URL       "https://eth.llamarpc.com"
set_secret POLYGON_RPC_URL   "https://polygon-rpc.com"
set_secret MIN_CONFIRMATIONS "12"

# --- FX / settlement ---
set_secret USD_TO_NGN_RATE      "1600"
set_secret CONVERSION_SPREAD_BPS "150"

# --- Deploy (uncomment + fill when a deploy workflow lands, mirrors Otuburu) ---
# set_secret LINODE_HOST    "dummy.host"
# set_secret LINODE_USER    "user1"
# set_secret LINODE_SSH_PORT "22"
# set_secret LINODE_SSH_KEY "dummy-private-key"
# set_secret GHCR_TOKEN     "dummy-ghcr-token"

echo "Done. Review with:  gh secret list --repo ${REPO}"
