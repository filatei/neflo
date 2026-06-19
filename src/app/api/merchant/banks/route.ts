import { NextResponse } from "next/server";
import { getCurrentMerchant } from "@/lib/merchant";
import { getNgnRail } from "@/lib/rails";

export const dynamic = "force-dynamic";

export async function GET() {
  const merchant = await getCurrentMerchant();
  if (!merchant) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const banks = await getNgnRail().listBanks();
  return NextResponse.json({ banks });
}
