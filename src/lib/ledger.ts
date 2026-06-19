import type { LedgerKind, Prisma } from "@prisma/client";
import { prisma } from "./db";

/**
 * Append a ledger entry and keep the cached MerchantBalance in sync.
 * amountMinor is signed: positive = credit, negative = debit (minor units).
 * Runs inside a transaction so balance + ledger never diverge.
 */
export async function postLedger(
  tx: Prisma.TransactionClient,
  params: {
    merchantId: string;
    ccy: string;
    amountMinor: bigint;
    kind: LedgerKind;
    reference?: string;
  },
) {
  await tx.ledgerEntry.create({
    data: {
      merchantId: params.merchantId,
      ccy: params.ccy,
      amountMinor: params.amountMinor,
      kind: params.kind,
      reference: params.reference,
    },
  });

  await tx.merchantBalance.upsert({
    where: {
      merchantId_ccy: { merchantId: params.merchantId, ccy: params.ccy },
    },
    create: {
      merchantId: params.merchantId,
      ccy: params.ccy,
      availableMinor: params.amountMinor,
    },
    update: {
      availableMinor: { increment: params.amountMinor },
    },
  });
}

/** Read a merchant's balance in a currency (minor units). */
export async function getBalanceMinor(merchantId: string, ccy: string) {
  const b = await prisma.merchantBalance.findUnique({
    where: { merchantId_ccy: { merchantId, ccy } },
  });
  return b?.availableMinor ?? 0n;
}
