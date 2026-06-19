import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Public: the checkout page polls this to detect payment.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const charge = await prisma.charge.findUnique({
    where: { id },
    select: { status: true, amountUsd: true, paidUsd: true, successUrl: true },
  });
  if (!charge) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({
    status: charge.status,
    amountUsd: Number(charge.amountUsd),
    paidUsd: Number(charge.paidUsd),
    successUrl: charge.successUrl,
  });
}
