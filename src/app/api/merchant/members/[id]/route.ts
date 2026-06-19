import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canManage, getCurrentMembership } from "@/lib/merchant";

const patchSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "DEVELOPER", "VIEWER"]),
});

async function load(merchantId: string, id: string) {
  const member = await prisma.merchantMember.findUnique({ where: { id } });
  return member && member.merchantId === merchantId ? member : null;
}

// Don't allow removing/demoting the last owner.
async function ownerCount(merchantId: string) {
  return prisma.merchantMember.count({
    where: { merchantId, role: "OWNER" },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const m = await getCurrentMembership();
  if (!m) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!canManage(m.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const member = await load(m.merchant.id, id);
  if (!member) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid role" }, { status: 400 });
  }
  if (
    member.role === "OWNER" &&
    parsed.data.role !== "OWNER" &&
    (await ownerCount(m.merchant.id)) <= 1
  ) {
    return NextResponse.json(
      { error: "cannot demote the last owner" },
      { status: 400 },
    );
  }
  await prisma.merchantMember.update({
    where: { id },
    data: { role: parsed.data.role },
  });
  return NextResponse.json({ ok: true });
}

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
  const member = await load(m.merchant.id, id);
  if (!member) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (member.role === "OWNER" && (await ownerCount(m.merchant.id)) <= 1) {
    return NextResponse.json(
      { error: "cannot remove the last owner" },
      { status: 400 },
    );
  }
  await prisma.merchantMember.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
