import { describe, it, expect } from "vitest";
import {
  assertTxnAmount,
  allowCreate,
  allowPayAttempt,
  clearPayAttempts,
  LimitError,
  PER_TXN_MAX_MINOR,
  MIN_TXN_MINOR,
} from "@/lib/tappay/limits";

describe("tappay per-transaction caps", () => {
  it("accepts an amount within bounds", () => {
    expect(() => assertTxnAmount(500_000n)).not.toThrow(); // ₦5,000
  });

  it("rejects below the minimum", () => {
    expect(() => assertTxnAmount(MIN_TXN_MINOR - 1n)).toThrow(LimitError);
  });

  it("rejects above the ₦15,000 cap", () => {
    expect(() => assertTxnAmount(PER_TXN_MAX_MINOR + 1n)).toThrow(LimitError);
    try {
      assertTxnAmount(PER_TXN_MAX_MINOR + 1n);
    } catch (e) {
      expect((e as LimitError).code).toBe("amount_too_high");
      expect((e as LimitError).status).toBe(422);
    }
  });
});

describe("tappay rate limits", () => {
  it("allows 10 session creates per minute then blocks", () => {
    const id = "mch_rate_" + Math.random();
    for (let i = 0; i < 10; i++) expect(allowCreate(id)).toBe(true);
    expect(allowCreate(id)).toBe(false); // 11th blocked
  });

  it("caps PIN attempts per session at 5", () => {
    const sid = "sess_" + Math.random();
    for (let i = 0; i < 5; i++) expect(allowPayAttempt(sid)).toBe(true);
    expect(allowPayAttempt(sid)).toBe(false); // 6th blocked
    clearPayAttempts(sid);
    expect(allowPayAttempt(sid)).toBe(true); // reset after success
  });
});
