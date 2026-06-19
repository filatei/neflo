# Squad go-live checklist

KYC is approved → live APIs (virtual accounts, transfers, account lookup,
card/USSD gateway) are unlocked. Validate in **sandbox** first, because a few
endpoint paths/field names in `src/lib/rails/squad.ts` were implemented from
docs at a distance and must be confirmed against https://docs.squadco.com before
real money flows.

## A. Sandbox validation
1. Squad dashboard → get the **sandbox secret key**.
2. Set secrets + redeploy:
   ```bash
   gh secret set SQUAD_SECRET_KEY --repo filatei/neflo --body "sk_test_xxx"
   gh secret set SQUAD_BASE_URL   --repo filatei/neflo --body "https://sandbox-api-d.squadco.com"
   ```
3. Exercise each flow in the app; watch `bash /opt/neflo/app/scripts/monitor.sh logs app`.

## B. Confirm each call against docs (fields to verify)
For each, check the **request path**, **field names**, **amount unit** (kobo vs
naira), and **response field names**. All are isolated in `squad.ts`.

| Rail method | Endpoint used | Verify |
|---|---|---|
| `resolveAccount` | `POST /payout/account/lookup` | ✅ path confirmed. Confirm body `bank_code` is the **NIP code** (from `/payout/banks`, not CBN), `account_number`; response `data.account_name`. |
| `listBanks` | `GET /payout/banks` | Response array field names (`code`/`name`). Codes here are the NIP codes used by lookup/transfer. |
| `sendTransfer` | `POST /payout/transfer` | Field names (`transaction_reference`, `amount`, `bank_code`, `account_number`, `account_name`, `currency_id`, `remark`); **amount unit = kobo**; success/`data` shape. |
| `createVirtualAccount` (per-charge) | `POST /virtual-accounts/transaction` | Dynamic/transaction VA endpoint + fields; response `virtual_account_number`, `bank_name`, `account_name`, `customer_identifier`. |
| merchant static NUBAN | (reuses createVirtualAccount) | Squad's **permanent/customer** VA endpoint differs (needs customer/BVN). Wire the correct endpoint for the merchant deposit account. |
| `initiateCheckout` (card/USSD) | `POST /transaction/initiate` | `transaction_ref` vs `transaction_reference`; **amount unit = kobo**; `payment_channels`; response `data.checkout_url`. |
| `verifyTransaction` | `GET /transaction/verify/{ref}` | Response `data.transaction_status`, `data.transaction_amount` (unit). |
| webhook signature | header `x-squad-signature`, HMAC-**SHA512** of raw body w/ secret | ✅ algorithm confirmed. Confirm exact header name. |
| inbound transfer webhook | `parseInbound` fields | `virtual_account_number`/`account_number`, `transaction_reference`, **amount unit** (transfer webhooks often Naira, gateway kobo). |

Card crediting already **verifies server-side** (`/transaction/verify`) and
credits the amount Neflo recorded at initiation, so the gateway amount-unit risk
is contained. The remaining unit risks are **transfer webhook** (inbound) and
**sendTransfer** (payout) — confirm those carefully.

## C. Go live
1. Swap to **live** key + base URL, redeploy:
   ```bash
   gh secret set SQUAD_SECRET_KEY --repo filatei/neflo --body "sk_live_xxx"
   gh secret set SQUAD_BASE_URL   --repo filatei/neflo --body "https://api-d.squadco.com"
   ```
2. Squad dashboard → **Webhook URL** = `https://neflo.torama.money/api/webhooks/squad`.
3. One small **real** transaction per rail (VA transfer in, card pay, payout out);
   confirm balances + `charge.paid` webhook + transactions view.

## Rollback
Set `SQUAD_SECRET_KEY` empty and redeploy → rail returns to mock (no real calls).

## Pre-launch: rotate the wallet mnemonic
Do this **before any real crypto deposits** (rotation changes address derivation,
so old derived addresses become unreachable — fine pre-launch, catastrophic
after). Generate a fresh seed, store it in a password manager + offline, set
`WALLET_MNEMONIC`, redeploy.
```bash
docker run --rm --entrypoint node ghcr.io/filatei/neflo-app:latest \
  -e "console.log(require('ethers').Wallet.createRandom().mnemonic.phrase)"
gh secret set WALLET_MNEMONIC --repo filatei/neflo --body "word1 ... word12"
```
