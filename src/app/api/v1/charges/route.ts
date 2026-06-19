import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authenticateApiKey, unauthorized } from "@/lib/api-auth";
import { createCharge } from "@/lib/charge";

export const dynamic = "force-dynamic";

function checkoutUrl(req: Request, id: string) {
  const base = process.env.APP_URL ?? new URL(req.url).origin;
  return `${base}/pay/${id}`;
}

const createSchema = z.object({
  amount_usd: z.number().positive().max(1_000_000),
  description: z.string().max(140).optional(),
  reference: z.string().max(80).optional(),
  success_url: z.string().url().optional(),
  expires_in_minutes: z.number().int().positive().max(20_160).optional(),
});

// POST /api/v1/charges — create a hosted-checkout charge.
export async function POST(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth) return unauthorized();
  if (auth.merchant.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "kyb_required", message: "Complete business verification to accept payments" },
      { status: 403 },
    );
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const b = parsed.data;
  const charge = await createCharge(auth.merchant.id, {
    amountUsd: b.amount_usd,
    description: b.description,
    reference: b.reference,
    successUrl: b.success_url,
    expiresInMinutes: b.expires_in_minutes,
  });

  return NextResponse.json(
    {
      id: charge.id,
      status: charge.status,
      amount_usd: Number(charge.amountUsd),
      reference: charge.reference,
      checkout_url: checkoutUrl(req, charge.id),
      created_at: charge.createdAt,
    },
    { status: 201 },
  );
}

// GET /api/v1/charges — list recent charges.
export async function GET(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth) return unauthorized();

  const charges = await prisma.charge.findMany({
    where: { merchantId: auth.merchant.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({
    data: charges.map((c) => ({
      id: c.id,
      status: c.status,
      amount_usd: Number(c.amountUsd),
      paid_usd: Number(c.paidUsd),
      reference: c.reference,
      checkout_url: checkoutUrl(req, c.id),
      created_at: c.createdAt,
    })),
  });
}
