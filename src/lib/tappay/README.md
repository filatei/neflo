# TapPay module (Phase 1 backend)

Contactless **merchant collection** — a customer scans a merchant's QR to pay them.
Built per `neflo_tappay_buildplan.md`. Isolated: no existing payment module was modified.

## What's here

- `token.ts` — sign/verify the QR session token (JWT, HS256 via `jose`) + ULID.
- `pin.ts` — transaction-PIN hashing (Node scrypt, no new dep). WebAuthn/passkey is the planned fast-follow.
- `session.ts` — session lifecycle: create / safe-details / **atomic single-use consume** / cancel / mark paid/failed / lazy expiry.
- `collect.ts` — internal ledger transfer (atomic debit→credit) + rolling daily cap.
- `limits.ts` — per-txn / daily caps + in-process rate limits (dependency-free).
- `events.ts` — in-process pub/sub backing the SSE stream.
- `audit.ts` — best-effort audit log.

Routes under `src/app/api/tappay/`: `session` (POST), `session/[id]` (GET safe details, DELETE cancel),
`pay` (POST authorise from balance), `status/[id]` (GET poll), `events/[id]` (GET SSE), `pin` (GET/POST manage PIN).

## Money model

- **Internal** (this phase): payer is a Neflo account → instant ledger transfer (debit payer `TAPPAY_PAY_OUT`, credit merchant `TAPPAY_COLLECT_IN`), both referencing the session id.
- **Collection** (anonymous card/transfer payer): handed to Neflo's existing `Charge` → virtual-account checkout. Frontend handoff; not a new rail.

## Security (spec §5)

QR token carries only `session_id`/`merchant_id`/`amount`/`exp` (no account data); HS256 signed; **single-use via an atomic `UPDATE … WHERE status IN (PENDING,SCANNED) AND expiresAt>now`** (returns count 0 ⇒ 409); 5-min TTL; PIN required to pay from balance; amount locked server-side (`/pay` is `.strict()` and reads amount from the signed token, never the client body); rate limits; ₦15k per-txn + ₦50k/day caps; idempotency field; full audit log.

## To run it

```bash
npm install                 # pulls jose + vitest (added to package.json)
npx prisma generate
npx prisma db push          # applies TapPaySession/TapPayAudit + User.txnPinHash + new LedgerKind values
# set TAPPAY_TOKEN_SECRET in .env (see .env.example)
npm run typecheck
npm test                    # vitest: token, pin, limits (pure-logic, no DB)
```

## Not yet built (next sessions)

- PWA screens (`CollectSheet`, `PayScanner`) — build sequence steps 10–14.
- WebAuthn/passkey (fingerprint) as a `/pay` auth option alongside PIN.
- DB-backed integration test for double-spend / insufficient-funds (needs a test Postgres).
- Collection-path SSE on webhook (currently the internal path emits live; collection reconciles on status read).
