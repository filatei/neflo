import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateApiKey, unauthorized } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET /api/v1/transactions — recent received payments (crypto + NGN transfer).
export async function GET(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth) return unauthorized();

  const [deposits, ngn] = await Promise.all([
    prisma.stablecoinDeposit.findMany({
      where: { merchantId: auth.merchant.id },
      orderBy: { detectedAt: "desc" },
      take: 100,
      include: { conversion: true },
    }),
    prisma.ngnPayment.findMany({
      where: { merchantId: auth.merchant.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const data = [
    ...deposits.map((d) => ({
      id: d.id,
      type: "stablecoin" as const,
      asset: d.asset,
      chain: d.chain,
      amount: Number(d.amount),
      status: d.status,
      tx_hash: d.txHash,
      credited_local: d.conversion ? Number(d.conversion.localAmount) : null,
      local_currency: d.conversion?.localCcy ?? null,
      at: d.detectedAt,
    })),
    ...ngn.map((p) => ({
      id: p.id,
      type: "bank_transfer" as const,
      provider: p.provider,
      amount_ngn: Number(p.amountKobo) / 100,
      status: "CREDITED" as const,
      reference: p.transactionRef,
      at: p.createdAt,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return NextResponse.json({ data });
}
