import { createHash, randomBytes } from "crypto";
import type { ApiMode } from "@prisma/client";

/**
 * API keys: shown to the merchant once at creation, stored only as a SHA-256
 * hash. Format: nf_<test|live>_<32 hex>. The prefix (nf_live_abcd…) is stored
 * for display/identification.
 */
export function generateApiKey(mode: ApiMode) {
  const env = mode === "LIVE" ? "live" : "test";
  const secret = randomBytes(24).toString("hex");
  const plaintext = `nf_${env}_${secret}`;
  const prefix = plaintext.slice(0, 12);
  const hash = hashApiKey(plaintext);
  return { plaintext, prefix, hash };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}
