import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentMerchant } from "@/lib/merchant";
import { createPayout, InsufficientBalanceError } from "@/lib/payout";

const schema = z.object({
  amount: z.number().positive().max(100_000_000), // NGN
  bankCode: z.string().min(2).max(10),
  accountNumber: z.string().length(10),
});

export async function GET() {
  const merchant = await getCurrentMerchant();
  if (!merchant) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const payouts = await prisma.payout.findMany({
    where: { merchantId: merchant.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ payouts });
}

export async function POST(req: Request) {
  const merchant = await getCurrentMerchant();
  if (!merchant) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  try {
    const payout = await createPayout(merchant.id, {
      amountKobo: BigInt(Math.round(parsed.data.amount * 100)),
      bankCode: parsed.data.bankCode,
      accountNumber: parsed.data.accountNumber,
    });
    return NextResponse.json({
      id: payout.id,
      status: payout.status,
      accountName: payout.accountName,
      amount: Number(payout.amountKobo) / 100,
      failureReason: payout.failureReason,
    });
  } catch (e) {
    if (e instanceof InsufficientBalanceError) {
      return NextResponse.json(
        { error: "insufficient_balance", message: "Insufficient balance" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
