import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

/**
 * Transaction PIN hashing — dependency-free (Node scrypt). The PIN authorises
 * pay-from-balance on the internal TapPay path. WebAuthn/passkey (fingerprint /
 * Face ID) is the planned fast-follow; this is the Phase-1 authenticator.
 *
 * Format: scrypt$<saltHex>$<hashHex>
 */

const scryptAsync = promisify(scrypt);
const KEYLEN = 32;

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scryptAsync(pin, salt, KEYLEN)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = (await scryptAsync(pin, salt, KEYLEN)) as Buffer;
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
