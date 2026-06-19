import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canManage, getCurrentMembership } from "@/lib/merchant";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const m = await getCurrentMembership();
  if (!m) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!canManage(m.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const invite = await prisma.merchantInvite.findUnique({ where: { id } });
  if (!invite || invite.merchantId !== m.merchant.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await prisma.merchantInvite.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
