import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateApiKey, unauthorized } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET /api/v1/charges/:id — fetch one charge.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(req);
  if (!auth) return unauthorized();

  const { id } = await params;
  const charge = await prisma.charge.findUnique({ where: { id } });
  if (!charge || charge.merchantId !== auth.merchant.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const base = process.env.APP_URL ?? new URL(req.url).origin;
  return NextResponse.json({
    id: charge.id,
    status: charge.status,
    amount_usd: Number(charge.amountUsd),
    paid_usd: Number(charge.paidUsd),
    reference: charge.reference,
    description: charge.description,
    success_url: charge.successUrl,
    checkout_url: `${base}/pay/${charge.id}`,
    paid_at: charge.paidAt,
    created_at: charge.createdAt,
  });
}
