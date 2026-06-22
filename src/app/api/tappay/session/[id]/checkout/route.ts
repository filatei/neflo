import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/merchant";
import { getById } from "@/lib/tappay/session";
import { createCollectionCheckout } from "@/lib/tappay/collect";

export const dynamic = "force-dynamic";

/**
 * Turn a TapPay session into a hosted-checkout charge for a customer who isn't a
 * Neflo account holder. Returns a checkout URL + Naira virtual account; when the
 * customer pays, the session reconciles to PAID automatically.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const m = await getCurrentMembership();
  if (!m) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const session = await getById(id);
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (session.merchantId !== m.merchant.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!["PENDING", "SCANNED"].includes(session.status))
    return NextResponse.json({ error: "not_open" }, { status: 409 });

  const out = await createCollectionCheckout(session);
  return NextResponse.json({
    charge_id: out.chargeId,
    checkout_url: out.checkoutUrl,
    virtual_account: out.virtualAccount,
  });
}
