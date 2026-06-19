import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentMerchant } from "@/lib/merchant";
import { getOrCreateDepositAddress } from "@/lib/deposit-address";

const schema = z.object({
  chain: z.enum(["TRON", "ETHEREUM", "POLYGON"]),
});

export async function POST(req: Request) {
  const merchant = await getCurrentMerchant();
  if (!merchant) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid chain" }, { status: 400 });
  }

  try {
    const addr = await getOrCreateDepositAddress(merchant.id, parsed.data.chain);
    return NextResponse.json({
      chain: addr.chain,
      address: addr.address,
    });
  } catch (e) {
    // Most likely WALLET_MNEMONIC missing in dev.
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
