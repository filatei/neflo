# syntax=docker/dockerfile:1

# ---------- deps ----------
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
# .npmrc carries legacy-peer-deps (next-auth's optional @simplewebauthn@9 peer
# vs our v13) — it must be present for `npm ci` to resolve.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# ---------- builder ----------
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate the Prisma client and build the standalone server.
# DATABASE_URL is only needed to satisfy build-time client generation (no connect).
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://neflo:build@localhost:5432/neflo?schema=public"
ENV NEXTAUTH_SECRET="build-time-placeholder"
RUN npx prisma generate && npm run build

# ---------- runner ----------
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone output + static assets.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Prisma schema + the FULL dependency tree. The Next standalone build only
# traces the server's runtime modules, which omits the Prisma CLI and its deps
# (e.g. `effect`) needed to run `db push` at startup — so copy the complete set.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY docker-entrypoint.sh ./docker-entrypoint.sh

EXPOSE 3000
# The actual runtime uid:gid is injected by compose (the host `neflo` user),
# so the image itself stays uid-agnostic. Entrypoint applies migrations then boots.
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
