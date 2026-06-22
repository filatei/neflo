import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentMembership } from "@/lib/merchant";
import { InsufficientBalanceError } from "@/lib/payout";
import { verifySessionToken, type SessionTokenClaims } from "@/lib/tappay/token";
import { verifyPin } from "@/lib/tappay/pin";
import { verifyAuthentication, WEBAUTHN_AUTH_COOKIE } from "@/lib/tappay/webauthn";
import { getById, consume, markPaid, markFailed } from "@/lib/tappay/session";
import { internalTransfer, assertDailyCap } from "@/lib/tappay/collect";
import { allowPayAttempt, clearPayAttempts, LimitError } from "@/lib/tappay/limits";
import { audit } from "@/lib/tappay/audit";

export const dynamic = "force-dynamic";

// Authorise with EITHER a transaction PIN OR a WebAuthn passkey assertion.
// .strict() rejects any extra field — notably a client-supplied `amount`, which
// must never override the receiver-locked amount (spec §5 "amount locked").
const schema = z
  .object({
    token: z.string().min(20), // the scanned QR payload (signed JWT)
    pin: z.string().regex(/^\d{4,6}$/).optional(),
    assertion: z.record(z.unknown()).optional(), // WebAuthn AuthenticationResponseJSON
  })
  .strict()
  .refine((d) => Boolean(d.pin) !== Boolean(d.assertion), {
    message: "Provide exactly one of pin or assertion",
  });

/** Payer authorises a TapPay session from their Neflo balance (internal path). */
export async function POST(req: Request) {
  const m = await getCurrentMembership();
  if (!m) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", message: "Only a token and PIN are accepted" },
      { status: 422 },
    );
  }
  const { token } = parsed.data;
  const ip = req.headers.get("x-forwarded-for");
  const userAgent = req.headers.get("user-agent");

  // 1. Authenticate the QR: signature + expiry. Amount comes from the token.
  let claims: SessionTokenClaims;
  try {
    claims = await verifySessionToken(token);
  } catch {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }
  const sessionId = claims.sessionId;

  // 2. Brute-force guard on PIN attempts per session.
  if (!allowPayAttempt(sessionId)) {
    await audit("FAIL", { sessionId, actorId: m.userId, ip, userAgent, meta: { reason: "too_many_attempts" } });
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  // 3. Load the authoritative session and validate state.
  const session = await getById(sessionId);
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (session.status === "EXPIRED")
    return NextResponse.json({ error: "expired" }, { status: 410 });
  if (!["PENDING", "SCANNED"].includes(session.status))
    return NextResponse.json({ error: "already_settled" }, { status: 409 });
  if (session.merchantId !== claims.merchantId || session.amountMinor !== claims.amountMinor)
    return NextResponse.json({ error: "token_mismatch" }, { status: 400 });
  if (session.merchantId === m.merchant.id)
    return NextResponse.json({ error: "cannot_pay_self" }, { status: 400 });

  // 4. Sender auth — WebAuthn passkey (fingerprint / Face ID) OR transaction PIN.
  if (parsed.data.assertion) {
    const jar = await cookies();
    const challenge = jar.get(WEBAUTHN_AUTH_COOKIE)?.value;
    jar.delete(WEBAUTHN_AUTH_COOKIE);
    if (!challenge)
      return NextResponse.json({ error: "passkey_challenge_missing" }, { status: 400 });
    const ok = await verifyAuthentication(
      m.userId,
      parsed.data.assertion as Parameters<typeof verifyAuthentication>[1],
      challenge,
    );
    if (!ok) {
      await audit("FAIL", { sessionId, actorId: m.userId, ip, userAgent, meta: { reason: "bad_passkey" } });
      return NextResponse.json({ error: "invalid_passkey" }, { status: 401 });
    }
  } else {
    const user = await prisma.user.findUnique({
      where: { id: m.userId },
      select: { txnPinHash: true },
    });
    if (!user?.txnPinHash)
      return NextResponse.json({ error: "pin_not_set", message: "Set a TapPay PIN first" }, { status: 400 });
    if (!(await verifyPin(parsed.data.pin!, user.txnPinHash))) {
      await audit("FAIL", { sessionId, actorId: m.userId, ip, userAgent, meta: { reason: "bad_pin" } });
      return NextResponse.json({ error: "invalid_pin" }, { status: 401 });
    }
  }

  // 5. Daily cap (rolling 24h) for the payer account.
  try {
    await assertDailyCap(m.merchant.id, session.amountMinor);
  } catch (e) {
    if (e instanceof LimitError)
      return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
    throw e;
  }

  // 6. Atomic single-use claim — the primary double-spend guard.
  const claimed = await consume(sessionId, { payerMerchantId: m.merchant.id, payerUserId: m.userId });
  if (!claimed) {
    return NextResponse.json({ error: "already_consumed" }, { status: 409 });
  }

  // 7. Move the money on the ledger.
  try {
    await internalTransfer({
      payerMerchantId: m.merchant.id,
      receiverMerchantId: session.merchantId,
      amountMinor: session.amountMinor,
      ccy: session.ccy,
      reference: sessionId,
    });
  } catch (e) {
    await markFailed(sessionId, (e as Error).message);
    await audit("FAIL", { sessionId, actorId: m.userId, amountMinor: session.amountMinor, ip, userAgent, meta: { reason: (e as Error).message } });
    if (e instanceof InsufficientBalanceError)
      return NextResponse.json({ error: "insufficient_balance", message: "Insufficient balance" }, { status: 402 });
    return NextResponse.json({ error: "transfer_failed" }, { status: 500 });
  }

  await markPaid(sessionId);
  clearPayAttempts(sessionId);
  await audit("PAY", { sessionId, actorId: m.userId, amountMinor: session.amountMinor, ip, userAgent });

  return NextResponse.json({
    status: "PAID",
    ref: sessionId,
    amount_kobo: Number(session.amountMinor),
  });
}
