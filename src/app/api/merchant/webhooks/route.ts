import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentMerchant } from "@/lib/merchant";

const schema = z.object({
  url: z.string().url().max(500),
});

export async function GET() {
  const merchant = await getCurrentMerchant();
  if (!merchant) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const webhooks = await prisma.webhookEndpoint.findMany({
    where: { merchantId: merchant.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ webhooks });
}

export async function POST(req: Request) {
  const merchant = await getCurrentMerchant();
  if (!merchant) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "enter a valid https URL" }, { status: 400 });
  }

  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const ep = await prisma.webhookEndpoint.create({
    data: { merchantId: merchant.id, url: parsed.data.url, secret },
  });
  return NextResponse.json({
    id: ep.id,
    url: ep.url,
    secret: ep.secret,
    active: ep.active,
    createdAt: ep.createdAt,
  });
}
