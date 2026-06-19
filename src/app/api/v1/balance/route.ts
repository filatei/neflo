import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateApiKey, unauthorized } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET /api/v1/balance — merchant balances per currency (minor units).
export async function GET(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth) return unauthorized();

  const balances = await prisma.merchantBalance.findMany({
    where: { merchantId: auth.merchant.id },
  });
  return NextResponse.json({
    settlement_currency: auth.merchant.settlementCcy,
    balances: balances.map((b) => ({
      currency: b.ccy,
      available_minor: Number(b.availableMinor),
      available: Number(b.availableMinor) / 100,
    })),
  });
}
