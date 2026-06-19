import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentMerchant } from "@/lib/merchant";
import { createCharge } from "@/lib/charge";

const schema = z.object({
  amountUsd: z.number().positive().max(1_000_000),
  description: z.string().max(140).optional(),
  reference: z.string().max(80).optional(),
  successUrl: z.string().url().optional(),
  expiresInMinutes: z.number().int().positive().max(20_160).optional(),
});

export async function GET() {
  const merchant = await getCurrentMerchant();
  if (!merchant) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const charges = await prisma.charge.findMany({
    where: { merchantId: merchant.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ charges });
}

export async function POST(req: Request) {
  const merchant = await getCurrentMerchant();
  if (!merchant) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (merchant.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "kyb_required", message: "Complete business verification to accept payments" },
      { status: 403 },
    );
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const charge = await createCharge(merchant.id, parsed.data);
  return NextResponse.json({
    id: charge.id,
    url: `/pay/${charge.id}`,
  });
}
