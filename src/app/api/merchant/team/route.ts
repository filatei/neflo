import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentMembership } from "@/lib/merchant";

export const dynamic = "force-dynamic";

export async function GET() {
  const m = await getCurrentMembership();
  if (!m) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const [members, invites] = await Promise.all([
    prisma.merchantMember.findMany({
      where: { merchantId: m.merchant.id },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.merchantInvite.findMany({
      where: { merchantId: m.merchant.id, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    role: m.role,
    members: members.map((x) => ({
      id: x.id,
      email: x.user.email,
      name: x.user.name,
      role: x.role,
      you: x.userId === m.userId,
    })),
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      createdAt: i.createdAt,
    })),
  });
}
