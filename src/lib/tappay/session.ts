import type { TapPayChannel, TapPaySession } from "@prisma/client";
import { prisma } from "@/lib/db";
import { publish } from "./events";
import { signSessionToken, ulid } from "./token";
import { SESSION_TTL_SECONDS } from "./limits";

/**
 * TapPay session lifecycle. Redis-free: single-use is enforced by an atomic
 * conditional UPDATE (see `consume`), and TTL by the `expiresAt` column plus
 * lazy expiry on read. Statuses: PENDING -> SCANNED -> CONSUMING -> PAID, with
 * FAILED / CANCELLED / EXPIRED terminal branches.
 */

export type CreatedSession = {
  session: TapPaySession;
  qrPayload: string;
  eventsUrl: string;
};

export async function createSession(input: {
  merchantId: string;
  amountMinor: bigint;
  ccy?: string;
  note?: string | null;
  channel?: TapPayChannel;
  ipMerchant?: string | null;
}): Promise<CreatedSession> {
  const sessionId = ulid();
  const ccy = input.ccy ?? "NGN";
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  const session = await prisma.tapPaySession.create({
    data: {
      sessionId,
      merchantId: input.merchantId,
      amountMinor: input.amountMinor,
      ccy,
      note: input.note ?? null,
      channel: input.channel ?? "QR",
      status: "PENDING",
      expiresAt,
      ipMerchant: input.ipMerchant ?? null,
    },
  });

  const qrPayload = await signSessionToken(
    { sessionId, merchantId: input.merchantId, amountMinor: input.amountMinor, ccy },
    SESSION_TTL_SECONDS,
  );
  return { session, qrPayload, eventsUrl: `/api/tappay/events/${sessionId}` };
}

/** Lazily flip a non-terminal but past-TTL session to EXPIRED (and notify). */
async function expireIfNeeded(s: TapPaySession): Promise<TapPaySession> {
  const open = s.status === "PENDING" || s.status === "SCANNED";
  if (open && s.expiresAt.getTime() <= Date.now()) {
    const res = await prisma.tapPaySession.updateMany({
      where: { sessionId: s.sessionId, status: { in: ["PENDING", "SCANNED"] } },
      data: { status: "EXPIRED" },
    });
    if (res.count > 0) publish(s.sessionId, "expired");
    return { ...s, status: "EXPIRED" };
  }
  return s;
}

export async function getById(sessionId: string): Promise<TapPaySession | null> {
  const s = await prisma.tapPaySession.findUnique({ where: { sessionId } });
  if (!s) return null;
  return expireIfNeeded(s);
}

/**
 * Safe, payer-facing view for the confirm screen. Marks the session SCANNED
 * (first scan only) and emits `scanned` so the merchant sees "payment incoming".
 * Never returns account numbers.
 */
export async function getSafeDetails(sessionId: string) {
  const s = await getById(sessionId);
  if (!s) return null;

  if (s.status === "PENDING") {
    const res = await prisma.tapPaySession.updateMany({
      where: { sessionId, status: "PENDING" },
      data: { status: "SCANNED" },
    });
    if (res.count > 0) publish(sessionId, "scanned");
  }

  const merchant = await prisma.merchant.findUnique({
    where: { id: s.merchantId },
    select: { name: true },
  });

  return {
    session_id: s.sessionId,
    amount_kobo: Number(s.amountMinor),
    currency: s.ccy,
    note: s.note,
    merchant_name: merchant?.name ?? "Merchant",
    merchant_avatar: null as string | null,
    status: s.status === "PENDING" ? "SCANNED" : s.status,
    expires_at: s.expiresAt.toISOString(),
  };
}

/**
 * Atomically claim a session for payment. The single UPDATE … WHERE
 * status IN (PENDING, SCANNED) AND expiresAt > now is the primary double-spend
 * guard: exactly one caller can win (count === 1); a second caller sees count
 * 0 and must be rejected with 409. Replaces the spec's Redis SET NX.
 */
export async function consume(
  sessionId: string,
  by: { payerMerchantId: string; payerUserId: string },
): Promise<boolean> {
  const res = await prisma.tapPaySession.updateMany({
    where: {
      sessionId,
      status: { in: ["PENDING", "SCANNED"] },
      expiresAt: { gt: new Date() },
    },
    data: {
      status: "CONSUMING",
      settlement: "INTERNAL",
      payerMerchantId: by.payerMerchantId,
      payerUserId: by.payerUserId,
      consumedAt: new Date(),
    },
  });
  return res.count === 1;
}

export async function markPaid(
  sessionId: string,
  opts: { providerRef?: string | null } = {},
): Promise<void> {
  const s = await prisma.tapPaySession.update({
    where: { sessionId },
    data: { status: "PAID", paidAt: new Date(), providerRef: opts.providerRef ?? null },
  });
  publish(sessionId, "paid", { amountMinor: s.amountMinor, ref: s.providerRef ?? s.sessionId });
}

/**
 * Flip a TapPay COLLECTION session to PAID once its linked Charge is paid (an
 * anonymous customer paid by card/transfer). Called from recomputeChargeStatus
 * on the charge's PENDING -> PAID transition. Best-effort, idempotent.
 */
export async function reconcileChargePaid(chargeId: string): Promise<void> {
  const tp = await prisma.tapPaySession.findFirst({
    where: { chargeId, status: { in: ["PENDING", "SCANNED", "CONSUMING"] } },
  });
  if (tp) await markPaid(tp.sessionId, { providerRef: chargeId });
}

export async function markFailed(sessionId: string, reason: string): Promise<void> {
  await prisma.tapPaySession.updateMany({
    where: { sessionId, status: { in: ["CONSUMING", "SCANNED", "PENDING"] } },
    data: { status: "FAILED" },
  });
  publish(sessionId, "failed", { ref: reason });
}

/** Receiver cancels a session that hasn't been paid yet. */
export async function cancel(sessionId: string, merchantId: string): Promise<boolean> {
  const res = await prisma.tapPaySession.updateMany({
    where: { sessionId, merchantId, status: { in: ["PENDING", "SCANNED"] } },
    data: { status: "CANCELLED" },
  });
  if (res.count > 0) publish(sessionId, "cancelled");
  return res.count > 0;
}
