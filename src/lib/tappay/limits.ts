/**
 * TapPay limits and rate-limits. Per-transaction and daily caps mirror the spec
 * (CBN contactless posture) and are env-overridable. Rate limits are in-process
 * token buckets — fine for the single Neflo container; swap for a Postgres/Redis
 * counter if the app is ever horizontally scaled. This module is dependency-free
 * (no prisma) so the pure caps stay easy to unit-test; the DB-backed daily cap
 * lives in collect.ts.
 */

export const SESSION_TTL_SECONDS = num("TAPPAY_TTL_SECONDS", 300); // 5 min
export const PER_TXN_MAX_MINOR = BigInt(num("TAPPAY_PER_TXN_MAX_KOBO", 1_500_000)); // ₦15,000
export const DAILY_MAX_MINOR = BigInt(num("TAPPAY_DAILY_MAX_KOBO", 5_000_000)); // ₦50,000
export const MIN_TXN_MINOR = BigInt(num("TAPPAY_MIN_KOBO", 10_000)); // ₦100
const MAX_CREATES_PER_MIN = num("TAPPAY_MAX_CREATES_PER_MIN", 10);
const MAX_PAY_ATTEMPTS = num("TAPPAY_MAX_PAY_ATTEMPTS", 5);

function num(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export class LimitError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 422,
  ) {
    super(message);
    this.name = "LimitError";
  }
}

/** Per-transaction amount bounds (pure — easily unit-tested). */
export function assertTxnAmount(amountMinor: bigint): void {
  if (amountMinor < MIN_TXN_MINOR) {
    throw new LimitError(
      "amount_too_low",
      `Minimum is ₦${Number(MIN_TXN_MINOR) / 100}`,
    );
  }
  if (amountMinor > PER_TXN_MAX_MINOR) {
    throw new LimitError(
      "amount_too_high",
      `Maximum per tap is ₦${Number(PER_TXN_MAX_MINOR) / 100}`,
    );
  }
}

// ---- In-process rate limiting -------------------------------------------------
const createBuckets = new Map<string, number[]>();
const payAttempts = new Map<string, number>();

/** Allow at most MAX_CREATES_PER_MIN session creates per merchant per minute. */
export function allowCreate(merchantId: string): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const hits = (createBuckets.get(merchantId) ?? []).filter((t) => t > windowStart);
  if (hits.length >= MAX_CREATES_PER_MIN) {
    createBuckets.set(merchantId, hits);
    return false;
  }
  hits.push(now);
  createBuckets.set(merchantId, hits);
  return true;
}

/** Count a PIN attempt for a session; false once the cap is hit (anti-brute-force). */
export function allowPayAttempt(sessionId: string): boolean {
  const n = (payAttempts.get(sessionId) ?? 0) + 1;
  payAttempts.set(sessionId, n);
  return n <= MAX_PAY_ATTEMPTS;
}

export function clearPayAttempts(sessionId: string): void {
  payAttempts.delete(sessionId);
}
