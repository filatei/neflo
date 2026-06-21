import { describe, it, expect, beforeAll } from "vitest";
import { signSessionToken, verifySessionToken, ulid } from "@/lib/tappay/token";

beforeAll(() => {
  process.env.TAPPAY_TOKEN_SECRET = "test-secret-please-change-0123456789";
});

const claims = {
  sessionId: "01J4XMKN8PABCDEF",
  merchantId: "mch_123",
  amountMinor: 500000n,
  ccy: "NGN",
};

describe("tappay token", () => {
  it("round-trips a signed session token", async () => {
    const token = await signSessionToken(claims, 300);
    const out = await verifySessionToken(token);
    expect(out.sessionId).toBe(claims.sessionId);
    expect(out.merchantId).toBe(claims.merchantId);
    expect(out.amountMinor).toBe(500000n); // bigint preserved
    expect(out.ccy).toBe("NGN");
  });

  it("rejects a tampered token", async () => {
    const token = await signSessionToken(claims, 300);
    const tampered = token.slice(0, -3) + (token.slice(-3) === "AAA" ? "BBB" : "AAA");
    await expect(verifySessionToken(tampered)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const token = await signSessionToken(claims, -10); // already expired
    await expect(verifySessionToken(token)).rejects.toThrow();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSessionToken(claims, 300);
    process.env.TAPPAY_TOKEN_SECRET = "a-totally-different-secret-value-9876";
    await expect(verifySessionToken(token)).rejects.toThrow();
    process.env.TAPPAY_TOKEN_SECRET = "test-secret-please-change-0123456789";
  });
});

describe("ulid", () => {
  it("is 26 chars, unique, and time-sortable", () => {
    const a = ulid(1_000_000_000_000);
    const b = ulid(1_000_000_000_001);
    expect(a).toHaveLength(26);
    expect(a).not.toBe(ulid(1_000_000_000_000)); // randomness differs
    expect(a < b).toBe(true); // later timestamp sorts after
  });
});
