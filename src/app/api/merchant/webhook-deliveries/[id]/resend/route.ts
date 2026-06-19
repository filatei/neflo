import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentMerchant } from "@/lib/merchant";
import { resendDelivery } from "@/lib/webhook";

// Merchant-triggered manual resend of a single webhook delivery.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const merchant = await getCurrentMerchant();
  if (!merchant) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await params;
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id },
    include: { endpoint: true },
  });
  if (!delivery || delivery.endpoint.merchantId !== merchant.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await resendDelivery(id);
  const updated = await prisma.webhookDelivery.findUnique({
    where: { id },
    select: { status: true, attempts: true, responseStatus: true },
  });
  return NextResponse.json({ ok: true, ...updated });
}
