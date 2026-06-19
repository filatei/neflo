import { NextResponse } from "next/server";
import { getCurrentMerchant } from "@/lib/merchant";
import { getOrCreateMerchantVirtualAccount } from "@/lib/ngn";

// Provision/fetch the merchant's permanent Naira deposit account.
export async function POST() {
  const merchant = await getCurrentMerchant();
  if (!merchant) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  try {
    const va = await getOrCreateMerchantVirtualAccount({
      id: merchant.id,
      name: merchant.name,
    });
    return NextResponse.json({
      accountNumber: va.accountNumber,
      bankName: va.bankName,
      accountName: va.accountName,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
