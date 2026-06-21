import { describe, it, expect } from "vitest";
import { hashPin, verifyPin, isValidPinFormat } from "@/lib/tappay/pin";

describe("tappay pin", () => {
  it("accepts 4–6 digit PINs only", () => {
    expect(isValidPinFormat("1234")).toBe(true);
    expect(isValidPinFormat("123456")).toBe(true);
    expect(isValidPinFormat("123")).toBe(false);
    expect(isValidPinFormat("1234567")).toBe(false);
    expect(isValidPinFormat("12a4")).toBe(false);
  });

  it("verifies a correct PIN and rejects a wrong one", async () => {
    const hash = await hashPin("4821");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPin("4821", hash)).toBe(true);
    expect(await verifyPin("4822", hash)).toBe(false);
  });

  it("uses a unique salt per hash", async () => {
    const a = await hashPin("0000");
    const b = await hashPin("0000");
    expect(a).not.toBe(b); // different salt => different stored value
    expect(await verifyPin("0000", a)).toBe(true);
    expect(await verifyPin("0000", b)).toBe(true);
  });

  it("rejects a malformed stored hash", async () => {
    expect(await verifyPin("0000", "garbage")).toBe(false);
  });
});
