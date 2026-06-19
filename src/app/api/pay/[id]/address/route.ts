import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrCreateChargeAddress } from "@/lib/deposit-address";

const schema = z.object({
  chain: z.enum(["TRON", "ETHEREUM", "POLYGON"]),
});

// Public: a payer requests a deposit address for a charge on a chosen network.
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
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid chain" }, { status: 400 });
  }

  try {
    const addr = await getOrCreateChargeAddress(charge, parsed.data.chain);
    return NextResponse.json({ chain: addr.chain, address: addr.address });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
