# Deploy hardening

Two production incidents informed this:
1. A manual `docker compose up` recreated `app` from a **stale floating `:latest`**
   whose schema was *behind* the live DB → `prisma db push` proposed dropping
   real tables/columns and crash-looped (it refused to drop — no data lost).
2. Free public EVM RPCs (`llamarpc`, `polygon-rpc`) block VPS IPs → monitor spam.

## Done (in this batch)
- **RPC fallback + better defaults** (`src/lib/chains.ts`): `|| default`, defaults
  to PublicNode. Set `ETH_RPC_URL` / `POLYGON_RPC_URL` secrets (PublicNode, or
  Alchemy/Infura for production).
- **Image pinning** (`deploy.yml`): each deploy writes `IMAGE_TAG=<sha>` into
  `/opt/neflo/app/.env`, so any later `docker compose up` uses that exact build,
  never a floating `:latest`. **Rule: never run `docker compose pull app` /
  `up` with `IMAGE_TAG` unset.** To intentionally roll back, set
  `IMAGE_TAG=<old-sha>` explicitly.

## TODO: switch `db push` → `prisma migrate deploy` (do deliberately)
`db push` diffs schema-vs-DB and can propose destructive drops. Migrations apply
only explicit, reviewed SQL and never drop unexpectedly. Steps to adopt on the
**existing** (already-populated) DB — run where the Prisma engine has network
(your Mac or CI), NOT in the Cowork sandbox:

1. Generate the baseline migration from the current schema:
   ```bash
   mkdir -p prisma/migrations/0_init
   npx prisma migrate diff --from-empty \
     --to-schema-datamodel prisma/schema.prisma --script \
     > prisma/migrations/0_init/migration.sql
   ```
2. Commit it.
3. **Baseline** the live DB (it already has this schema) so migrate doesn't try
   to re-create it — mark 0_init as already applied, against prod `DATABASE_URL`:
   ```bash
   npx prisma migrate resolve --applied 0_init
   ```
4. Change the container entrypoint (`docker-entrypoint.sh`) from
   `prisma db push --skip-generate` to `prisma migrate deploy`.
5. Future schema changes: `npx prisma migrate dev --name <change>` locally →
   commit the new migration → deploy applies it via `migrate deploy`.

After this, a stale/old image can never drop data: it would simply have fewer
migrations and apply nothing destructive.
