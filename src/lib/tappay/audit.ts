import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Append a TapPay audit record. Best-effort: auditing must never break the
 * payment path, so failures are swallowed (and logged) rather than thrown.
 * Satisfies the spec's "every session create/scan/confirm/fail/cancel logged
 * with user, amount, ip, user-agent, timestamp" requirement.
 */
export type TapPayEvent =
  | "CREATE"
  | "SCAN"
  | "PAY"
  | "FAIL"
  | "CANCEL"
  | "EXPIRE";

export async function audit(
  event: TapPayEvent,
  data: {
    sessionId?: string;
    actorId?: string;
    amountMinor?: bigint;
    ip?: string | null;
    userAgent?: string | null;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await prisma.tapPayAudit.create({
      data: {
        event,
        sessionId: data.sessionId,
        actorId: data.actorId,
        amountMinor: data.amountMinor,
        ip: data.ip ?? null,
        userAgent: data.userAgent ?? null,
        meta: data.meta ? (data.meta as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (e) {
    console.warn("[tappay] audit write failed:", (e as Error).message);
  }
}
