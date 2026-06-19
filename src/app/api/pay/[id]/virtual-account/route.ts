import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUsdRate } from "@/lib/rate";
import { getOrCreateChargeVirtualAccount } from "@/lib/ngn";

const schema = z.object({ name: z.string().max(80).optional() });

// Public: payer requests a Naira virtual account to pay a charge by transfer.
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

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  const name = parsed.success ? (parsed.data.name ?? "Customer") : "Customer";

  try {
    const va = await getOrCreateChargeVirtualAccount(charge, name);
    const rate = await getUsdRate("NGN");
    return NextResponse.json({
      accountNumber: va.accountNumber,
      bankName: va.bankName,
      accountName: va.accountName,
      amountNgn: Number(va.amountKobo) / 100,
      rate,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
