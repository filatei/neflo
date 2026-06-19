import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canDevelop, getCurrentMembership, getCurrentMerchant } from "@/lib/merchant";
import { generateApiKey } from "@/lib/apikey";

const createSchema = z.object({
  label: z.string().min(1).max(60),
  mode: z.enum(["TEST", "LIVE"]).default("TEST"),
});

export async function GET() {
  const merchant = await getCurrentMerchant();
  if (!merchant) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const keys = await prisma.apiKey.findMany({
    where: { merchantId: merchant.id, revokedAt: null },
    select: { id: true, label: true, prefix: true, mode: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ keys });
}

export async function POST(req: Request) {
  const m = await getCurrentMembership();
  if (!m) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!canDevelop(m.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const merchant = m.merchant;
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const { plaintext, prefix, hash } = generateApiKey(parsed.data.mode);
  await prisma.apiKey.create({
    data: {
      merchantId: merchant.id,
      label: parsed.data.label,
      mode: parsed.data.mode,
      prefix,
      hash,
    },
  });

  // The plaintext key is returned exactly once.
  return NextResponse.json({ apiKey: plaintext, prefix });
}
