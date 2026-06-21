import { prisma } from "@/lib/db";
import { postLedger } from "@/lib/ledger";
import { InsufficientBalanceError } from "@/lib/payout";
import { DAILY_MAX_MINOR, LimitError } from "./limits";

/** Rolling 24h cap on what a payer account can spend via TapPay (internal path). */
export async function assertDailyCap(
  payerMerchantId: string,
  amountMinor: bigint,
): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await prisma.tapPaySession.findMany({
    where: {
      payerMerchantId,
      status: "PAID",
      settlement: "INTERNAL",
      paidAt: { gte: since },
    },
    select: { amountMinor: true },
  });
  const spent = rows.reduce((a, r) => a + r.amountMinor, 0n);
  if (spent + amountMinor > DAILY_MAX_MINOR) {
    throw new LimitError(
      "daily_cap_exceeded",
      `This would exceed your ₦${Number(DAILY_MAX_MINOR) / 100} daily TapPay limit`,
    );
  }
}

/**
 * Internal TapPay settlement: move money between two Neflo accounts entirely on
 * the ledger — instant, free, no bank rail. One atomic $transaction:
 *   1. check the payer has the funds (no overdraft, no race), and
 *   2. post a debit on the payer and a credit on the receiving merchant.
 * Both legs reference the TapPay session id, so the transfer is visible in the
 * existing ledger/reconciliation with no parallel system.
 *
 * The anonymous-customer COLLECTION path (card / bank transfer) is handled by
 * Neflo's existing Charge → virtual-account checkout, not here.
 */
export async function internalTransfer(params: {
  payerMerchantId: string;
  receiverMerchantId: string;
  amountMinor: bigint;
  ccy: string;
  reference: string;
}): Promise<void> {
  if (params.amountMinor <= 0n) throw new Error("Amount must be positive");
  if (params.payerMerchantId === params.receiverMerchantId) {
    throw new Error("Payer and receiver are the same account");
  }

  await prisma.$transaction(async (tx) => {
    const bal = await tx.merchantBalance.findUnique({
      where: {
        merchantId_ccy: { merchantId: params.payerMerchantId, ccy: params.ccy },
      },
    });
    if (!bal || bal.availableMinor < params.amountMinor) {
      throw new InsufficientBalanceError();
    }
    await postLedger(tx, {
      merchantId: params.payerMerchantId,
      ccy: params.ccy,
      amountMinor: -params.amountMinor,
      kind: "TAPPAY_PAY_OUT",
      reference: params.reference,
    });
    await postLedger(tx, {
      merchantId: params.receiverMerchantId,
      ccy: params.ccy,
      amountMinor: params.amountMinor,
      kind: "TAPPAY_COLLECT_IN",
      reference: params.reference,
    });
  });
}
