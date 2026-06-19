import { prisma } from "./db";
import { quoteConversion } from "./conversion";
import { postLedger } from "./ledger";
import { sendDepositCreditedEmail } from "./mailer";
import { recomputeChargeStatus } from "./charge";

/**
 * Credit a confirmed stablecoin deposit:
 *   1. quote USD->local conversion (1:1 USD peg, minus spread)
 *   2. write the Conversion record
 *   3. post the net amount + spread to the ledger
 *   4. flip the deposit to CREDITED
 * All in one DB transaction, idempotent on deposit status.
 * Notifies the merchant owner by email after commit.
 */
export async function creditDeposit(depositId: string): Promise<void> {
  const dep = await prisma.stablecoinDeposit.findUnique({
    where: { id: depositId },
    include: { merchant: true, address: true },
  });
  if (!dep) throw new Error(`deposit ${depositId} not found`);
  if (dep.status === "CREDITED") return; // already done

  const localCcy = dep.merchant.settlementCcy;
  const usdAmount = Number(dep.amount); // USDT/USDC ~ 1:1 USD
  const quote = await quoteConversion({ usdAmount, localCcy });

  await prisma.$transaction(async (tx) => {
    // Re-read inside the tx to guard against double-credit races.
    const fresh = await tx.stablecoinDeposit.findUnique({
      where: { id: depositId },
      select: { status: true },
    });
    if (!fresh || fresh.status === "CREDITED") return;

    await tx.conversion.create({
      data: {
        merchantId: dep.merchantId,
        depositId: dep.id,
        asset: dep.asset,
        usdAmount: dep.amount,
        rate: quote.rate.toString(),
        spreadBps: quote.spreadBps,
        localCcy,
        localAmount: quote.netLocal.toFixed(2),
      },
    });

    await postLedger(tx, {
      merchantId: dep.merchantId,
      ccy: localCcy,
      amountMinor: quote.netMinor,
      kind: "DEPOSIT_CREDIT",
      reference: `${dep.chain}:${dep.txHash}`,
    });

    await tx.stablecoinDeposit.update({
      where: { id: dep.id },
      data: { status: "CREDITED", confirmedAt: new Date() },
    });
  });

  // Notify the merchant's owners (best-effort, outside the tx).
  try {
    const owners = await prisma.merchantMember.findMany({
      where: { merchantId: dep.merchantId, role: { in: ["OWNER", "ADMIN"] } },
      include: { user: true },
    });
    await Promise.all(
      owners
        .filter((m) => m.user.email)
        .map((m) =>
          sendDepositCreditedEmail({
            to: m.user.email,
            asset: dep.asset,
            usdAmount: Number(dep.amount).toFixed(2),
            localCcy,
            localAmount: quote.netLocal.toFixed(2),
            txHash: dep.txHash,
          }),
        ),
    );
  } catch (e) {
    console.error("[credit] email notify failed", e);
  }

  // If this deposit funded a hosted-checkout charge, advance the charge status
  // (and fire the charge.paid webhook when it tips over the expected amount).
  if (dep.address?.chargeId) {
    try {
      await recomputeChargeStatus(dep.address.chargeId);
    } catch (e) {
      console.error("[credit] charge status update failed", e);
    }
  }
}
