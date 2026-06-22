import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession, consume } from "@/lib/tappay/session";

/**
 * Integration test for the atomic single-use guard — the primary double-spend
 * protection. Exercises the real `consume()` (a conditional UPDATE) against a
 * real Postgres, so it only runs when you point it at a disposable test DB:
 *
 *   TAPPAY_TEST_DB=1 DATABASE_URL=postgresql://…/neflo_test npm test
 *
 * Without TAPPAY_TEST_DB it skips, so the normal (DB-less) CI run stays green.
 */
const run = process.env.TAPPAY_TEST_DB ? describe : describe.skip;
const MERCHANT = "m_test_double_spend";

run("tappay consume — double-spend guard", () => {
  beforeAll(() => {
    process.env.TAPPAY_TOKEN_SECRET ||= "integration-test-secret-0123456789abcd";
  });
  afterAll(async () => {
    await prisma.tapPaySession.deleteMany({ where: { merchantId: MERCHANT } });
    await prisma.$disconnect();
  });

  async function freshSession() {
    const { session } = await createSession({ merchantId: MERCHANT, amountMinor: 100_000n });
    return session;
  }
  const payer = { payerMerchantId: "p_payer", payerUserId: "u_payer" };

  it("lets exactly one of two concurrent consumes win", async () => {
    const s = await freshSession();
    const results = await Promise.all([
      consume(s.sessionId, payer),
      consume(s.sessionId, { payerMerchantId: "p2", payerUserId: "u2" }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("rejects a second consume after the first succeeds", async () => {
    const s = await freshSession();
    expect(await consume(s.sessionId, payer)).toBe(true);
    expect(await consume(s.sessionId, payer)).toBe(false);
  });

  it("rejects an expired session", async () => {
    const s = await freshSession();
    await prisma.tapPaySession.update({
      where: { sessionId: s.sessionId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    expect(await consume(s.sessionId, payer)).toBe(false);
  });

  it("rejects a cancelled session", async () => {
    const s = await freshSession();
    await prisma.tapPaySession.update({
      where: { sessionId: s.sessionId },
      data: { status: "CANCELLED" },
    });
    expect(await consume(s.sessionId, payer)).toBe(false);
  });
});
