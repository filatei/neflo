import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "crypto";

/**
 * TapPay QR token. A short-lived JWT that carries ONLY the session handle and
 * the locked amount — never account numbers, BVN, NIN, or PAN. Signed HS256
 * with a dedicated secret; the same server signs and verifies, so symmetric
 * signing is sufficient (RS256 would add nothing here). If NIBSS NQR interop is
 * ever required, revisit (NQR may mandate RS256 + an envelope).
 */

const SUBJECT = "tp_session";

function secret(): Uint8Array {
  const s = process.env.TAPPAY_TOKEN_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("TAPPAY_TOKEN_SECRET (or NEXTAUTH_SECRET) is not set");
  return new TextEncoder().encode(s);
}

export type SessionTokenClaims = {
  sessionId: string;
  merchantId: string;
  amountMinor: bigint;
  ccy: string;
};

/** Sign a QR token that expires `ttlSeconds` from now. */
export async function signSessionToken(
  claims: SessionTokenClaims,
  ttlSeconds: number,
): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sid: claims.sessionId,
    mid: claims.merchantId,
    amt: claims.amountMinor.toString(), // BigInt -> string (JWT has no bigint)
    ccy: claims.ccy,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(SUBJECT)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + ttlSeconds)
    .sign(secret());
}

/** Verify a QR token. Throws if signature/expiry/subject is invalid. */
export async function verifySessionToken(
  token: string,
): Promise<SessionTokenClaims> {
  const { payload } = await jwtVerify(token, secret(), { subject: SUBJECT });
  if (
    typeof payload.sid !== "string" ||
    typeof payload.mid !== "string" ||
    typeof payload.amt !== "string" ||
    typeof payload.ccy !== "string"
  ) {
    throw new Error("Malformed TapPay token");
  }
  return {
    sessionId: payload.sid,
    merchantId: payload.mid,
    amountMinor: BigInt(payload.amt),
    ccy: payload.ccy,
  };
}

// ---------------------------------------------------------------------------
// ULID — sortable, unique session id (spec calls for ULID, no extra dep).
// Crockford base32, 48-bit time + 80-bit randomness.
// ---------------------------------------------------------------------------
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function ulid(now: number = Date.now()): string {
  let time = now;
  const timeChars: string[] = [];
  for (let i = 9; i >= 0; i--) {
    timeChars[i] = CROCKFORD[time % 32];
    time = Math.floor(time / 32);
  }
  const rand = randomBytes(16);
  let randStr = "";
  for (let i = 0; i < 16; i++) randStr += CROCKFORD[rand[i] % 32];
  return timeChars.join("") + randStr;
}
