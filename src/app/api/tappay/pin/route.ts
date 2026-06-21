import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentMembership } from "@/lib/merchant";
import { hashPin, verifyPin, isValidPinFormat } from "@/lib/tappay/pin";

export const dynamic = "force-dynamic";

const schema = z.object({
  pin: z.string(),
  current_pin: z.string().optional(),
});

/** Whether the signed-in user has a TapPay PIN set. */
export async function GET() {
  const m = await getCurrentMembership();
  if (!m) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: m.userId },
    select: { txnPinHash: true },
  });
  return NextResponse.json({ pin_set: Boolean(user?.txnPinHash) });
}

/** Set (first time) or change the TapPay transaction PIN. */
export async function POST(req: Request) {
  const m = await getCurrentMembership();
  if (!m) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || !isValidPinFormat(parsed.data.pin)) {
    return NextResponse.json(
      { error: "invalid_pin", message: "PIN must be 4–6 digits" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: m.userId },
    select: { txnPinHash: true },
  });

  // Changing an existing PIN requires the current one.
  if (user?.txnPinHash) {
    const current = parsed.data.current_pin ?? "";
    if (!(await verifyPin(current, user.txnPinHash))) {
      return NextResponse.json(
        { error: "current_pin_invalid", message: "Current PIN is incorrect" },
        { status: 401 },
      );
    }
  }

  await prisma.user.update({
    where: { id: m.userId },
    data: { txnPinHash: await hashPin(parsed.data.pin) },
  });
  return NextResponse.json({ ok: true, pin_set: true });
}
