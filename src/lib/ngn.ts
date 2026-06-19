import { prisma } from "./db";
import { getUsdRate } from "./rate";
import { getNgnRail } from "./rails";
import { postLedger } from "./ledger";
import { recomputeChargeStatus } from "./charge";
import type { InboundTransfer } from "./rails/types";

/**
 * Issue (or reuse) a Naira virtual account for a charge. The expected USD
 * amount is converted to NGN at the live rate so the payer transfers an exact
 * Naira figure.
 */
export async function getOrCreateChargeVirtualAccount(
  charge: { id: string; merchantId: string; amountUsd: unknown },
  customerName: string,
) {
  const existing = await prisma.ngnVirtualAccount.findFirst({
    where: { chargeId: charge.id },
  });
  if (existing) return existing;

  const rate = await getUsdRate("NGN");
  const amountNgn = Number(charge.amountUsd) * rate;
  const amountKobo = BigInt(Math.round(amountNgn * 100));

  const rail = getNgnRail();
  const va = await rail.createVirtualAccount({
    chargeId: charge.id,
    amountKobo,
    customerName: customerName || "Customer",
    reference: `nf_${charge.id}`,
  });

  return prisma.ngnVirtualAccount.create({
    data: {
      chargeId: charge.id,
      merchantId: charge.merchantId,
      provider: rail.name,
      accountNumber: va.accountNumber,
      bankName: va.bankName,
      accountName: va.accountName,
      providerRef: va.providerRef,
      amountKobo,
    },
  });
}

/** Provision (or fetch) a merchant's permanent NUBAN for receiving Naira. */
export async function getOrCreateMerchantVirtualAccount(merchant: {
  id: string;
  name: string;
}) {
  const existing = await prisma.merchantVirtualAccount.findUnique({
    where: { merchantId: merchant.id },
  });
  if (existing) return existing;

  const rail = getNgnRail();
  // NOTE (live): Squad's permanent/customer virtual account uses a different
  // endpoint than the dynamic per-charge one — verify when wiring live keys.
  const va = await rail.createVirtualAccount({
    chargeId: "merchant",
    amountKobo: 0n,
    customerName: merchant.name || "Merchant",
    reference: `mrc_${merchant.id}`,
  });
  return prisma.merchantVirtualAccount.create({
    data: {
      merchantId: merchant.id,
      provider: rail.name,
      accountNumber: va.accountNumber,
      bankName: va.bankName,
      accountName: va.accountName,
      providerRef: va.providerRef,
    },
  });
}

/**
 * Credit a received NGN transfer: record the payment (idempotent on
 * transactionRef), credit the merchant's NGN ledger directly. Matches a charge
 * virtual account (advances the charge) OR a merchant deposit account (no
 * charge). Returns true if newly credited.
 */
export async function creditNgnTransfer(t: InboundTransfer): Promise<boolean> {
  const va = await prisma.ngnVirtualAccount.findFirst({
    where: { accountNumber: t.accountNumber },
  });
  const mva = va
    ? null
    : await prisma.merchantVirtualAccount.findFirst({
        where: { accountNumber: t.accountNumber },
      });
  if (!va && !mva) return false; // not one of ours

  const merchantId = va ? va.merchantId : mva!.merchantId;
  const chargeId = va ? va.chargeId : null;
  const provider = va ? va.provider : mva!.provider;

  const rate = await getUsdRate("NGN");
  const usdAmount = Number(t.amountKobo) / 100 / rate;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.ngnPayment.create({
        data: {
          virtualAccountId: va ? va.id : null,
          chargeId,
          merchantId,
          provider,
          transactionRef: t.transactionRef,
          amountKobo: t.amountKobo,
          usdAmount: usdAmount.toFixed(6),
        },
      });
      // NGN received is already in the settlement currency — credit directly.
      await postLedger(tx, {
        merchantId,
        ccy: "NGN",
        amountMinor: t.amountKobo,
        kind: "DEPOSIT_CREDIT",
        reference: `ngn:${provider}:${t.transactionRef}`,
      });
    });
  } catch {
    // Unique transactionRef violation → already processed. Idempotent.
    return false;
  }

  if (chargeId) await recomputeChargeStatus(chargeId);
  return true;
}

/**
 * Credit a card/USSD payment (hosted gateway) to a charge. Idempotent on the
 * gateway transaction reference.
 */
export async function creditCardPayment(params: {
  chargeId: string;
  transactionRef: string;
  amountKobo: bigint;
}): Promise<boolean> {
  const charge = await prisma.charge.findUnique({
    where: { id: params.chargeId },
  });
  if (!charge) return false;

  const rate = await getUsdRate("NGN");
  const usdAmount = Number(params.amountKobo) / 100 / rate;
  const rail = getNgnRail();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.ngnPayment.create({
        data: {
          chargeId: charge.id,
          merchantId: charge.merchantId,
          provider: rail.name,
          method: "card",
          transactionRef: params.transactionRef,
          amountKobo: params.amountKobo,
          usdAmount: usdAmount.toFixed(6),
        },
      });
      await postLedger(tx, {
        merchantId: charge.merchantId,
        ccy: "NGN",
        amountMinor: params.amountKobo,
        kind: "DEPOSIT_CREDIT",
        reference: `card:${rail.name}:${params.transactionRef}`,
      });
    });
  } catch {
    return false; // duplicate transactionRef → already credited
  }

  await recomputeChargeStatus(charge.id);
  return true;
}
