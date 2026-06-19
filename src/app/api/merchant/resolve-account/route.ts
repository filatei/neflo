import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentMerchant } from "@/lib/merchant";
import { getNgnRail } from "@/lib/rails";

const schema = z.object({
  bankCode: z.string().min(2).max(10),
  accountNumber: z.string().min(10).max(10),
});

export async function POST(req: Request) {
  const merchant = await getCurrentMerchant();
  if (!merchant) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  try {
    const { accountName } = await getNgnRail().resolveAccount(
      parsed.data.bankCode,
      parsed.data.accountNumber,
    );
    return NextResponse.json({ accountName });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
