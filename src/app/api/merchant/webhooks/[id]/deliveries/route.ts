import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentMerchant } from "@/lib/merchant";

export const dynamic = "force-dynamic";

// Recent delivery attempts for one of the merchant's endpoints.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const merchant = await getCurrentMerchant();
  if (!merchant) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await params;
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!endpoint || endpoint.merchantId !== merchant.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const deliveries = await prisma.webhookDelivery.findMany({
    where: { endpointId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      event: true,
      status: true,
      attempts: true,
      responseStatus: true,
      lastError: true,
      nextRetryAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ deliveries });
}
