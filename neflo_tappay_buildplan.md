# Neflo TapPay — Adapted Build Plan (Merchant Collection edition)

**Status:** Draft for review · **Author:** Claude (from `neflo_tappay_spec.docx` v1.0) · **Date:** June 2026
**Reframed:** TapPay is a **customer-pays-merchant** contactless collection feature inside Neflo. The original spec's consumer person-to-person (P2P) vision is parked as a **separate future app** (Appendix A). Security controls, token design, and limits from the spec are preserved.

---

## 0. The reframe, and why

Neflo is a **merchant/developer payments product** (accept payments, API, payouts) — the same lane as Paystack/Monnify/Flutterwave. Pure **consumer ↔ consumer** "send money to a friend by tapping phones" is a different *product* with a different persona, identity model, KYC tier, licence posture, and growth motion. The companies that do both (Moniepoint, OPay) keep them as **separate apps on a shared backend**.

So TapPay, to fit Neflo, becomes **"customer taps/scans to pay a merchant"** — receiver is always a Neflo **merchant**, payer is their **customer**. This is on-brand (it's collection, like Paystack "Pay with Transfer" / SoftPOS), reuses merchant accounts and the existing checkout pipeline, and needs **no consumer wallet**.

| Aspect | Original spec (P2P) | This plan (merchant collection) |
|---|---|---|
| Receiver | any individual | **a Neflo merchant** (always an account holder) |
| Payer | any individual | **a customer** — Neflo account *or* anonymous (pays by transfer/card) |
| Identity needed | consumer wallets + KYC | none new; receiver = existing merchant |
| Money in | NIP between two people's banks | **internal ledger** (payer has Neflo balance) **or existing collection rails** (virtual-account transfer / card) |
| Brand fit | weak (consumer in a dev product) | **strong** (merchant collection) |

**Decisions carried in (your answers + this reframe):**
1. **Money model — internal first, collection fallback.** Payer is a Neflo balance holder → instant internal ledger transfer to the merchant. Otherwise → resolve to the merchant's existing **Charge → virtual account / card** checkout.
2. **Infra — SSE + Postgres.** No Redis, no Socket.io, no custom server. Spec treated as guidance.
3. **Deliverable now — this plan.** Code follows sign-off.
4. **Consumer P2P — out of Neflo**, future separate app (Appendix A).

---

## 1. Stack reality (unchanged from analysis)

Neflo is **Next.js 15 App Router + Prisma 6 + Postgres**, `next start` in a container. No NestJS, Redis, Socket.io, or JWT lib (but `jose` ships with NextAuth, and `qrcode` is already a dependency).

| Spec assumed | We use |
|---|---|
| NestJS module | Next.js route handlers `src/app/api/tappay/**/route.ts` |
| TypeORM | Prisma |
| Redis `SET NX` | Atomic Postgres conditional `UPDATE` (same single-use guarantee) |
| Socket.io gateway | **SSE** route + polling fallback |
| RS256 "private key" | **HS256 via `jose`** (same server signs+verifies) |
| Providus/Wema NIP | Internal **ledger** (`LedgerEntry`/`MerchantBalance`) + existing **Charge/virtual-account/Squad** collection |

---

## 2. How it rides on what Neflo already has

Neflo already does merchant collection. TapPay is a **fast contactless on-ramp** to it, not a new rail:

- `Charge` + `NgnVirtualAccount` + `/api/pay/[id]/virtual-account` + `CheckoutClient` — the existing "create an amount to collect → customer pays by transfer/card" flow.
- `/api/webhooks/squad` — already finalises inbound NGN payments.
- `LedgerEntry` (kobo) + `MerchantBalance` — where money lands and is tracked.
- `auth()` (NextAuth v5) — merchant/user session.

TapPay adds: a **tap session** (QR/NFC-delivered), an **instant internal-balance path** for payers who are themselves Neflo accounts, and **live SSE confirmation** so the merchant sees "paid" on screen the moment it clears.

---

## 3. Architecture

```
src/
  app/api/tappay/
    session/route.ts            POST  merchant creates a collection session
    session/[id]/route.ts       GET   payer fetches safe details · DELETE merchant cancels
    pay/route.ts                POST  payer authorises (internal-balance path)
    status/[id]/route.ts        GET   polling fallback
    events/[id]/route.ts        GET   SSE stream (text/event-stream)
  lib/tappay/
    session.ts                  create / getSafe / atomicConsume / cancel / expire
    token.ts                    sign + verify QR token (HS256, jose) + ULID
    collect.ts                  internal-balance debit→merchant credit; else link to Charge
    limits.ts                   per-txn / daily / rate limits
    events.ts                   in-process SSE pub/sub (EventEmitter; LISTEN/NOTIFY if scaled)
    audit.ts                    audit-log append
  components/tappay/
    CollectSheet.tsx            MERCHANT: amount entry + QR + live "paid" state
    PayScanner.tsx              CUSTOMER: camera + jsQR + confirm + (PIN/WebAuthn for balance pay)
    tappay-states.tsx           success / failure / expired shared UI
```

**Choices & why:** HS256 token via `jose` (no new dep, same signer/verifier — RS256 buys nothing here); single-use via atomic `UPDATE … WHERE status='PENDING' AND expires_at>now() RETURNING` (0 rows ⇒ 409, replaces Redis NX); SSE over plain HTTP through Cloudflare/Caddy (no socket server); all money stays in the existing ledger/checkout so reconciliation is unified.

---

## 4. Data model (Prisma)

```prisma
model TapPaySession {
  id           String            @id @default(cuid())
  sessionId    String            @unique           // ULID, in QR + token
  merchantId   String                              // RECEIVER — always a merchant
  payerUserId  String?                             // set if payer is a Neflo account
  chargeId     String?                             // linked Charge for the collection-rail path
  amountMinor  BigInt                              // kobo; merchant-set, server-locked
  ccy          String            @default("NGN")
  note         String?
  status       TapPayStatus      @default(PENDING)
  channel      TapPayChannel     @default(QR)      // QR | NFC | LINK
  settlement   TapPaySettlement?                   // INTERNAL | COLLECTION (set at pay)
  providerRef  String?                             // squad/charge ref
  idempotencyKey String?         @unique
  ipPayer      String?
  ipMerchant   String?
  createdAt    DateTime          @default(now())
  paidAt       DateTime?
  consumedAt   DateTime?
  expiresAt    DateTime
  @@index([merchantId, createdAt])
  @@index([payerUserId, createdAt])
  @@index([status])
  @@map("tappay_sessions")
}

enum TapPayStatus      { PENDING SCANNED CONSUMING PAID FAILED CANCELLED EXPIRED }
enum TapPayChannel     { QR NFC LINK }
enum TapPaySettlement  { INTERNAL COLLECTION }

model TapPayAudit {
  id        String   @id @default(cuid())
  sessionId String?
  actorId   String?
  event     String                                 // CREATE SCAN PAY FAIL CANCEL EXPIRE
  amountMinor BigInt?
  ip        String?
  userAgent String?
  meta      Json?
  createdAt DateTime @default(now())
  @@index([sessionId])
  @@map("tappay_audit")
}
```

New `LedgerKind` values: `TAPPAY_COLLECT_IN` (merchant credit) and `TAPPAY_PAY_OUT` (payer debit, internal path only).

---

## 5. API (Next.js route handlers)

All amounts in **kobo**; auth via `auth()`; errors in Neflo's JSON shape.

| Route | Method | Behaviour |
|---|---|---|
| `/api/tappay/session` | POST | **Merchant** creates a collection session. Body `{ amount_kobo, currency:'NGN', note? }`. Validates limits. Persists `TapPaySession` (PENDING), signs token. Returns `{ session_id, qr_payload, expires_at, events_url }`. |
| `/api/tappay/session/[id]` | GET | **Payer** fetches *safe* details for the pay screen: `{ amount_kobo, merchant_name, merchant_avatar, currency, expires_at, pay_options }`. No bank/account numbers. Marks `SCANNED`, emits `scanned`. If payer not a Neflo account → returns the **Charge/checkout link** to pay by transfer/card. |
| `/api/tappay/session/[id]` | DELETE | Merchant cancels a PENDING session → `CANCELLED`, emit `cancelled`. |
| `/api/tappay/pay` | POST | **Payer who is a Neflo account** authorises from balance. Body `{ session_id, auth:{ pin? \| webauthn? } }` — **no amount accepted** (server-locked). Verify token → atomic consume → internal transfer (§6) → emit `paid` → audit. |
| `/api/tappay/status/[id]` | GET | Polling fallback. |
| `/api/tappay/events/[id]` | GET | **SSE** live events for the merchant's "paid" screen. |

The **collection-rail path** (anonymous customer) needs no new pay endpoint: the GET hands back the existing Charge checkout; Neflo's `/api/webhooks/squad` finalises and flips the linked `TapPaySession` to `PAID`, emitting `paid` over SSE.

Rate limits: 10 session creates / merchant / min; 5 pay attempts / session (PIN brute-force guard).

---

## 6. Money movement (internal first, collection fallback)

After scan, the GET decides the path from the payer:

1. **Payer is a Neflo balance holder → INTERNAL.** `POST /pay` runs one Prisma `$transaction`: atomic debit `UPDATE merchant_balances SET availableMinor = availableMinor - :amt WHERE merchantId=:payerAcct AND ccy='NGN' AND availableMinor >= :amt` (0 rows ⇒ 402 insufficient), credit the receiving merchant, two `LedgerEntry` rows (`TAPPAY_PAY_OUT`/`TAPPAY_COLLECT_IN`, `reference=session_id`), mark `PAID`, emit. **Instant, free, no external call.**
2. **Anonymous customer → COLLECTION.** Resolve the session to a `Charge`; customer pays via the existing **virtual-account transfer / card** checkout. Inbound `/api/webhooks/squad` credits the merchant ledger and flips the session `PAID` (idempotent on `idempotencyKey`/charge ref). Reuses 100% of the current collection pipeline.

Both paths land in the **same ledger** — unified reporting and reconciliation, no parallel rail.

---

## 7. Security controls — spec §5, mapped

| Control | Here | Note |
|---|---|---|
| No raw account data in QR | token = `session_id`,`merchant_id`,`amount`,`exp` only | ✔ |
| Token signed | HS256 (`jose`) + `TAPPAY_TOKEN_SECRET`; reject bad sig | deviation from RS256 — equivalent, flagged |
| Single use | atomic conditional `UPDATE` → 409 | replaces Redis NX |
| Short TTL | `expires_at = +300s`; expired ⇒ 404; sweeper | ✔ |
| Payer auth (balance path) | `/pay` requires PIN or WebAuthn before debit | **needs** a transaction PIN — see P-2 |
| Amount locked server-side | amount only from session; reject `amount` in body (422) | ✔ |
| Rate limiting | 10 creates/min/merchant; 5 pays/session | ✔ |
| ₦15,000 per-txn cap | applies to the **tap-from-balance** path; configurable env | card/transfer path uses normal Neflo limits |
| ₦50,000 daily cap | rolling 24h sum per payer (internal path) | ✔ |
| Idempotency | `idempotencyKey` unique; dedupe Squad webhook | ✔ |
| Audit log | every create/scan/pay/fail/cancel → `TapPayAudit` + ip/UA/ts | ✔ |

**P-2 — Payer auth (internal-balance path only):** transaction **PIN** (fastest), **WebAuthn/passkey** (best, more work), or PIN-now-passkey-later. Recommend the last. (Anonymous card/transfer payers authenticate with their own bank, so this only gates pay-from-Neflo-balance.)

---

## 8. Frontend (PWA, Phase 1)

- **Merchant — `CollectSheet`:** amount numpad + optional note → full-screen **QR** (`qrcode`, already present) + countdown + live state via SSE (`scanned → paid ✓`). This is the merchant showing a code for the customer to scan.
- **Customer — `PayScanner`:** camera (`getUserMedia` env-facing) + **jsQR** decode → pay screen (merchant name/avatar/amount). If the customer is signed into Neflo → confirm + **PIN/WebAuthn** → instant. If not → straight to the existing **checkout** (transfer/card). 15s processing timeout UI; success/failure/expired states.

New dep: `jsqr`. `qrcode` already in Neflo. SSE needs no library.

**P-3 — NQR:** wrapping the QR in NIBSS **NQR** envelope only matters if you want **other banks' apps** to scan a Neflo merchant's code. For Neflo-app payers it's unnecessary. Recommend deferring NQR until cross-bank scan is a goal — though for *merchant collection* it's more strategically relevant than it was for P2P, so revisit early if you want any-bank-scans-merchant.

---

## 9. Build sequence (each a separate, testable commit)

1. Prisma: `TapPaySession`, `TapPayAudit`, enums, two `LedgerKind` values → migrate.
2. `lib/tappay/token.ts` — sign/verify (jose HS256) + ULID.
3. `lib/tappay/session.ts` — create / getSafe / **atomicConsume** / cancel / expire.
4. `lib/tappay/limits.ts` + `audit.ts`.
5. `POST /session` + `GET /session/[id]` + `DELETE`.
6. `lib/tappay/events.ts` + `GET /events/[id]` (SSE) + `GET /status/[id]`.
7. `lib/tappay/collect.ts` — internal transfer (atomic) **and** Charge-link for the collection path.
8. `POST /pay` — token verify → consume → auth → internal transfer → emit → audit; wire the Squad webhook to flip linked sessions for the collection path.
9. **Unit tests:** atomic consume / double-spend, token tamper, amount-lock, per-txn + daily caps, insufficient funds. (match Neflo's test runner.)
10. PWA `CollectSheet` (merchant QR + SSE).
11. PWA `PayScanner` (camera + jsQR + pay/confirm + PIN/WebAuthn + checkout handoff).
12. PWA success / failure / expired states.
13. Payment-link channel (deep link → same session, for "send a request" collection).
14. E2E: two browser windows (merchant + customer), full QR round-trip on both paths.

**Prereqs to start coding:** P-2 (PIN vs passkey) and P-3 (NQR now or later). P-1 (consumer wallets) is **resolved — out of scope** for Neflo.

---

## 10. Deviations from the literal spec

1. **Persona:** consumer P2P → **merchant collection** (receiver = merchant).
2. **NestJS → Next.js route handlers.**
3. **Redis NX → Postgres atomic `UPDATE`.**
4. **Socket.io → SSE** (+ polling).
5. **RS256 → HS256 via jose.**
6. **NIP → internal ledger + existing Charge/virtual-account/Squad collection.**
7. **NQR deferred** (revisit for cross-bank merchant scans).
8. **Consumer wallets → out of Neflo**, separate future app (Appendix A).

All spec **security** and **limit** controls retained.

---

## Appendix A — Consumer P2P as a separate future app

The original "point your phone at a friend's and send money" remains a valid future product, built as its **own consumer app on the same backend platform**:

- **Shared core (reuse):** the ledger, KYC, bank/Squad rails, token + session + SSE design, and most of `lib/tappay/*`. The session/consume/transfer engine is persona-agnostic — only `receiver` changes from *merchant* to *individual wallet*.
- **New for that app:** individual **consumer wallets** (balance-holding `User`, not `Merchant`), consumer **KYC tiers** (BVN/NIN limits), a consumer **brand + mobile app** (PWA then Flutter for Android NFC HCE), and a **licence review** — holding consumer balances and P2P transfer typically implies a different CBN posture (wallet/MMO) than a PSSP gateway. *(Not legal advice — confirm with counsel.)*
- **Why separate:** different persona, two-sided consumer growth motion, distinct compliance surface, and brand clarity (a developer/merchant product shouldn't also be a consumer wallet). This mirrors how Moniepoint and OPay run a merchant product and a personal app as siblings on one platform.

Recommended path: ship **merchant collection** in Neflo now (this plan); evaluate the **consumer P2P app** as a separate initiative once the shared rails are proven in production.
