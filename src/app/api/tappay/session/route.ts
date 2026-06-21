import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentMembership } from "@/lib/merchant";
import { createSession } from "@/lib/tappay/session";
import { assertTxnAmount, allowCreate, LimitError } from "@/lib/tappay/limits";
import { audit } from "@/lib/tappay/audit";

export const dynamic = "force-dynamic";

const schema = z.object({
  amount_kobo: z.number().int().positive(),
  currency: z.literal("NGN").optional(),
  note: z.string().max(140).optional(),
});

/** Merchant creates a TapPay collection session and gets a signed QR payload. */
export async function POST(req: Request) {
  const m = await getCurrentMembership();
  if (!m) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (m.merchant.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "kyb_required", message: "Complete verification to receive payments" },
      { status: 403 },
    );
  }
  if (!allowCreate(m.merchant.id)) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many sessions — slow down" },
      { status: 429 },
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const amountMinor = BigInt(parsed.data.amount_kobo);
  try {
    assertTxnAmount(amountMinor);
  } catch (e) {
    if (e instanceof LimitError) {
      return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
    }
    throw e;
  }

  const ip = req.headers.get("x-forwarded-for");
  const { session, qrPayload, eventsUrl } = await createSession({
    merchantId: m.merchant.id,
    amountMinor,
    note: parsed.data.note ?? null,
    ipMerchant: ip,
  });
  await audit("CREATE", {
    sessionId: session.sessionId,
    actorId: m.userId,
    amountMinor,
    ip,
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({
    session_id: session.sessionId,
    qr_payload: qrPayload,
    amount_kobo: Number(amountMinor),
    currency: session.ccy,
    expires_at: session.expiresAt.toISOString(),
    events_url: eventsUrl,
  });
}
