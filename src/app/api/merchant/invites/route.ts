import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canManage, getCurrentMembership } from "@/lib/merchant";
import { sendInviteEmail } from "@/lib/mailer";

const schema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "DEVELOPER", "VIEWER"]),
});

export async function POST(req: Request) {
  const m = await getCurrentMembership();
  if (!m) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!canManage(m.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  // Already a member?
  const existing = await prisma.merchantMember.findFirst({
    where: { merchantId: m.merchant.id, user: { email } },
  });
  if (existing) {
    return NextResponse.json({ error: "already a member" }, { status: 409 });
  }

  const token = randomBytes(24).toString("hex");
  await prisma.merchantInvite.create({
    data: {
      merchantId: m.merchant.id,
      email,
      role: parsed.data.role,
      token,
      invitedBy: m.userId,
    },
  });

  const base = process.env.APP_URL ?? new URL(req.url).origin;
  await sendInviteEmail(
    email,
    `${base}/invite/${token}`,
    m.merchant.name,
    parsed.data.role,
  );

  return NextResponse.json({ ok: true });
}
