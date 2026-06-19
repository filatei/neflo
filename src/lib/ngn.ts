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

/**
 * Credit a received NGN transfer: record the payment (idempotent on
 * transactionRef), credit the merchant's NGN ledger directly, and advance the
 * charge. Returns true if newly credited.
 */
export async function creditNgnTransfer(t: InboundTransfer): Promise<boolean> {
  const va = await prisma.ngnVirtualAccount.findFirst({
    where: { accountNumber: t.accountNumber },
  });
  if (!va) return false; // not one of ours

  const rate = await getUsdRate("NGN");
  const usdAmount = Number(t.amountKobo) / 100 / rate;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.ngnPayment.create({
        data: {
          virtualAccountId: va.id,
          chargeId: va.chargeId,
          merchantId: va.merchantId,
          provider: va.provider,
          transactionRef: t.transactionRef,
          amountKobo: t.amountKobo,
          usdAmount: usdAmount.toFixed(6),
        },
      });
      // NGN received is already in the settlement currency — credit directly.
      await postLedger(tx, {
        merchantId: va.merchantId,
        ccy: "NGN",
        amountMinor: t.amountKobo,
        kind: "DEPOSIT_CREDIT",
        reference: `ngn:${va.provider}:${t.transactionRef}`,
      });
    });
  } catch {
    // Unique transactionRef violation → already processed. Idempotent.
    return false;
  }

  await recomputeChargeStatus(va.chargeId);
  return true;
}
