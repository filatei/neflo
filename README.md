# Neflo

Stablecoin-first payments platform. Lets platforms accept **USDT/USDC** (and, on the roadmap, local card/bank/USSD rails) and **settle in local currency** (NGN first). Built with Next.js App Router to stay fast on low-bandwidth networks. Strictly monochrome UI — white background, black-and-shades text, modals and toasts (never native alerts), mobile-first.

Hosted at **neflo.torama.money** (moving to **payments.torama.money**), on the same box as Otuburu.

## Stack

- **Next.js 15** (App Router, server actions, API routes) — fullstack monolith
- **Postgres + Prisma** — data, ledger, deposits
- **Auth.js v5 (NextAuth)** — Google sign-in, optional `@torama.money` allowlist
- **ethers v6 / TronGrid** — on-chain deposit detection (Ethereum, Polygon, TRON)
- **Tailwind** — monochrome design system
- **Nodemailer** — Google SMTP relay (same as Otuburu) for `@torama.money` mail

## What's built (milestone 1 — stablecoin rails)

- Per-merchant HD-derived deposit addresses on TRON (TRC20) + Ethereum/Polygon (ERC20)
- Deposit monitor: detects inbound USDT/USDC, advances confirmations, credits idempotently
- Live USD→NGN FX (open.er-api.com, hourly) with a configurable spread
- Double-entry-friendly ledger + cached merchant balances
- Merchant dashboard: overview, deposit (address + QR), transactions, API keys
- Email notification on credited deposits

## Getting started

```bash
cp .env.example .env        # fill in DATABASE_URL, GOOGLE_*, WALLET_MNEMONIC, etc.
npm install
npx prisma migrate dev      # create the schema
npm run dev                 # http://localhost:3000
```

Run the deposit monitor (or hit the cron endpoint):

```bash
npm run monitor             # long-lived loop
# or
curl -X POST -H "X-Internal-Secret: $INTERNAL_SECRET" http://localhost:3000/api/internal/scan
```

## Key paths

| Path | Purpose |
|------|---------|
| `prisma/schema.prisma` | Data model (merchants, deposits, conversions, ledger) |
| `src/auth.ts` | Auth.js Google config |
| `src/lib/hdwallet.ts` | BIP44 address derivation (TRON + EVM) |
| `src/lib/monitor.ts` | On-chain deposit scanner |
| `src/lib/credit.ts` | Conversion + ledger credit on confirmation |
| `src/lib/rate.ts` / `conversion.ts` | FX + spread |
| `src/app/dashboard/*` | Merchant UI |
| `src/app/api/internal/scan` | Monitor trigger (cron) |

## Roadmap

Local rails (Paystack, Monnify, Flutterwave, Squad/GTBank, Interswitch, Wema/ALAT, Providus), hosted checkout, payouts/sweeps to cold storage, webhooks to merchants, KYB/onboarding.

## Environment

See `.env.example` for the full list. Secrets (`WALLET_MNEMONIC`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `INTERNAL_SECRET`, SMTP) come from the deploy environment, same discipline as Otuburu.
