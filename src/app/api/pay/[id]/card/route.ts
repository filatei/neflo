import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { getUsdRate } from "@/lib/rate";
import { getNgnRail } from "@/lib/rails";
import { creditCardPayment } from "@/lib/ngn";

// Public: start a card/USSD payment for a charge via the hosted gateway.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const charge = await prisma.charge.findUnique({ where: { id } });
  if (!charge) {
    return NextResponse.json({ error: "charge not found" }, { status: 404 });
  }
  if (charge.status === "PAID") {
    return NextResponse.json({ error: "already paid" }, { status: 409 });
  }
  if (charge.expiresAt && charge.expiresAt < new Date()) {
    return NextResponse.json({ error: "charge expired" }, { status: 410 });
  }

  const rate = await getUsdRate("NGN");
  const amountKobo = BigInt(Math.round(Number(charge.amountUsd) * rate * 100));
  const reference = `cg_${charge.id}_${randomBytes(6).toString("hex")}`;
  const base = process.env.APP_URL ?? new URL(req.url).origin;

  try {
    const init = await getNgnRail().initiateCheckout({
      chargeId: charge.id,
      amountKobo,
      reference,
      callbackUrl: `${base}/pay/${charge.id}`,
    });

    if (init.checkoutUrl) {
      return NextResponse.json({ checkoutUrl: init.checkoutUrl });
    }

    // Mock mode: no hosted page — settle immediately.
    await creditCardPayment({ chargeId: charge.id, transactionRef: reference, amountKobo });
    return NextResponse.json({ paid: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
