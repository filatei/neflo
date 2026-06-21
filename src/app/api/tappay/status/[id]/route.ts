import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/merchant";
import { getById } from "@/lib/tappay/session";

export const dynamic = "force-dynamic";

/** Polling fallback for clients that cannot hold an SSE connection open. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const m = await getCurrentMembership();
  if (!m) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const s = await getById(id);
  if (!s) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    session_id: s.sessionId,
    status: s.status,
    amount_kobo: Number(s.amountMinor),
    currency: s.ccy,
    paid_at: s.paidAt?.toISOString() ?? null,
    expires_at: s.expiresAt.toISOString(),
  });
}
