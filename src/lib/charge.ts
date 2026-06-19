import { prisma } from "./db";
import { deliverWebhook } from "./webhook";

/** Create a hosted-checkout charge for a merchant. */
export async function createCharge(
  merchantId: string,
  input: {
    amountUsd: number;
    description?: string;
    reference?: string;
    successUrl?: string;
    expiresInMinutes?: number;
  },
) {
  const expiresAt = input.expiresInMinutes
    ? new Date(Date.now() + input.expiresInMinutes * 60_000)
    : null;

  return prisma.charge.create({
    data: {
      merchantId,
      amountUsd: input.amountUsd.toFixed(6),
      description: input.description,
      reference: input.reference,
      successUrl: input.successUrl,
      expiresAt,
    },
  });
}

/**
 * Recompute a charge's paid total from its credited deposits and advance its
 * status. Called after any deposit on a charge address is credited. Idempotent;
 * fires the `charge.paid` webhook exactly once on the PENDING/UNDERPAID -> PAID
 * transition.
 */
export async function recomputeChargeStatus(chargeId: string) {
  const charge = await prisma.charge.findUnique({ where: { id: chargeId } });
  if (!charge) return;

  const [stableAgg, ngnAgg] = await Promise.all([
    prisma.stablecoinDeposit.aggregate({
      where: { address: { chargeId }, status: "CREDITED" },
      _sum: { amount: true },
    }),
    prisma.ngnPayment.aggregate({
      where: { chargeId },
      _sum: { usdAmount: true },
    }),
  ]);
  // Total received in USD terms: on-chain stablecoins + NGN transfers (USD-equiv).
  const paid =
    Number(stableAgg._sum.amount ?? 0) + Number(ngnAgg._sum.usdAmount ?? 0);
  const expected = Number(charge.amountUsd);

  // 1-cent tolerance for rounding.
  const isPaid = paid + 0.01 >= expected;
  const wasPaid = charge.status === "PAID";
  const nextStatus = isPaid ? "PAID" : paid > 0 ? "UNDERPAID" : "PENDING";

  await prisma.charge.update({
    where: { id: chargeId },
    data: {
      paidUsd: paid.toFixed(6),
      status: nextStatus,
      paidAt: isPaid && !charge.paidAt ? new Date() : charge.paidAt,
    },
  });

  if (isPaid && !wasPaid) {
    await deliverWebhook(charge.merchantId, "charge.paid", {
      id: charge.id,
      amountUsd: expected,
      paidUsd: paid,
      reference: charge.reference,
    });
  }
}
