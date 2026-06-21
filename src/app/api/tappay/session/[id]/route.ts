import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/merchant";
import { getSafeDetails, cancel } from "@/lib/tappay/session";
import { audit } from "@/lib/tappay/audit";

export const dynamic = "force-dynamic";

/**
 * Payer fetches safe session details for the confirm screen (marks the session
 * SCANNED and notifies the merchant). Never returns account numbers. Requires a
 * signed-in Neflo user — for the internal pay-from-balance path. Anonymous
 * card/transfer payers go through the existing hosted checkout instead.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const m = await getCurrentMembership();
  if (!m) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const details = await getSafeDetails(id);
  if (!details) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (["EXPIRED", "CANCELLED"].includes(details.status)) {
    return NextResponse.json({ error: details.status.toLowerCase() }, { status: 410 });
  }

  // Signed-in payer pays from balance (the pay route rejects paying yourself).
  return NextResponse.json({ ...details, pay_options: ["balance"] });
}

/** Receiver cancels a session before it is paid. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const m = await getCurrentMembership();
  if (!m) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const ok = await cancel(id, m.merchant.id);
  if (!ok) {
    return NextResponse.json(
      { error: "not_cancellable", message: "Session is not yours or already settled" },
      { status: 409 },
    );
  }
  await audit("CANCEL", { sessionId: id, actorId: m.userId });
  return NextResponse.json({ ok: true });
}
