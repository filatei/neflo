import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentMerchant } from "@/lib/merchant";

const patchSchema = z.object({ active: z.boolean() });

async function ownEndpoint(merchantId: string, id: string) {
  const ep = await prisma.webhookEndpoint.findUnique({ where: { id } });
  return ep && ep.merchantId === merchantId ? ep : null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const merchant = await getCurrentMerchant();
  if (!merchant) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await params;
  if (!(await ownEndpoint(merchant.id, id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  await prisma.webhookEndpoint.update({
    where: { id },
    data: { active: parsed.data.active },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const merchant = await getCurrentMerchant();
  if (!merchant) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await params;
  if (!(await ownEndpoint(merchant.id, id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await prisma.webhookEndpoint.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
