import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const schema = z.object({ action: z.enum(["approve", "suspend", "reactivate"]) });

// Admin-only: change a merchant's verification status.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  const status =
    parsed.data.action === "suspend" ? "SUSPENDED" : "ACTIVE";
  await prisma.merchant.update({ where: { id }, data: { status } });
  return NextResponse.json({ ok: true, status });
}
