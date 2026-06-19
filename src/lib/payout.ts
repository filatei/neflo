import { randomUUID } from "crypto";
import { prisma } from "./db";
import { postLedger } from "./ledger";
import { getNgnRail } from "./rails";

export class InsufficientBalanceError extends Error {
  constructor() {
    super("Insufficient balance");
    this.name = "InsufficientBalanceError";
  }
}

/**
 * Withdraw NGN to a bank account.
 *   1. atomically check balance and debit the ledger (no overdraft, no race)
 *   2. send the transfer via the rail
 *   3. on failure, reverse the debit and mark the payout FAILED
 * Returns the payout record.
 */
export async function createPayout(
  merchantId: string,
  input: { amountKobo: bigint; bankCode: string; accountNumber: string },
) {
  if (input.amountKobo <= 0n) throw new Error("Amount must be positive");

  const rail = getNgnRail();
  const { accountName } = await rail.resolveAccount(
    input.bankCode,
    input.accountNumber,
  );
  if (!accountName) throw new Error("Could not resolve account name");

  const reference = `po_${randomUUID()}`;

  // Atomic balance check + debit + payout row.
  const payout = await prisma.$transaction(async (tx) => {
    const bal = await tx.merchantBalance.findUnique({
      where: { merchantId_ccy: { merchantId, ccy: "NGN" } },
    });
    if (!bal || bal.availableMinor < input.amountKobo) {
      throw new InsufficientBalanceError();
    }
    await postLedger(tx, {
      merchantId,
      ccy: "NGN",
      amountMinor: -input.amountKobo,
      kind: "PAYOUT_DEBIT",
      reference,
    });
    return tx.payout.create({
      data: {
        merchantId,
        amountKobo: input.amountKobo,
        bankCode: input.bankCode,
        accountNumber: input.accountNumber,
        accountName,
        provider: rail.name,
        reference,
        status: "PENDING",
      },
    });
  });

  // Execute the transfer (outside the DB transaction).
  try {
    const result = await rail.sendTransfer({
      amountKobo: input.amountKobo,
      bankCode: input.bankCode,
      accountNumber: input.accountNumber,
      accountName,
      reference,
    });

    if (result.status === "FAILED") {
      await reverse(merchantId, input.amountKobo, reference);
      return prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: "FAILED",
          failureReason: result.failureReason ?? "Transfer failed",
          providerRef: result.providerRef,
        },
      });
    }

    return prisma.payout.update({
      where: { id: payout.id },
      data: { status: result.status, providerRef: result.providerRef },
    });
  } catch (e) {
    await reverse(merchantId, input.amountKobo, reference);
    return prisma.payout.update({
      where: { id: payout.id },
      data: { status: "FAILED", failureReason: (e as Error).message },
    });
  }
}

/** Credit the debited amount back when a transfer fails. */
async function reverse(merchantId: string, amountKobo: bigint, reference: string) {
  await prisma.$transaction(async (tx) => {
    await postLedger(tx, {
      merchantId,
      ccy: "NGN",
      amountMinor: amountKobo,
      kind: "ADJUSTMENT",
      reference: `reverse:${reference}`,
    });
  });
}

/** Finalise a payout from a provider transfer webhook. */
export async function markPayoutStatus(
  reference: string,
  status: "PAID" | "FAILED",
  failureReason?: string,
) {
  const payout = await prisma.payout.findUnique({ where: { reference } });
  if (!payout || payout.status === "PAID") return;

  if (status === "FAILED" && payout.status !== "FAILED") {
    await reverse(payout.merchantId, payout.amountKobo, reference);
  }
  await prisma.payout.update({
    where: { reference },
    data: { status, failureReason },
  });
}
