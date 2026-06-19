/**
 * Squad rail smoke test. Exercises every rail method against whatever mode is
 * configured (mock if SQUAD_SECRET_KEY is unset, sandbox/live if set). Use it
 * to confirm endpoint paths and field mappings before flipping to live keys.
 *
 *   SQUAD_SECRET_KEY=sk_test_xxx SQUAD_BASE_URL=https://sandbox-api-d.squadco.com \
 *     tsx scripts/squad-smoke.ts
 */
import { getNgnRail } from "../src/lib/rails";

async function main() {
  const rail = getNgnRail();
  const live = !!process.env.SQUAD_SECRET_KEY;
  console.log(`[smoke] rail=${rail.name} mode=${live ? "LIVE/SANDBOX" : "MOCK"}`);

  console.log("\n[1] listBanks");
  const banks = await rail.listBanks();
  console.log(`  ${banks.length} banks, first:`, banks[0]);

  console.log("\n[2] resolveAccount (GTBank 058 / 0123456789)");
  try {
    console.log("  ", await rail.resolveAccount("058", "0123456789"));
  } catch (e) {
    console.log("  error:", (e as Error).message);
  }

  console.log("\n[3] createVirtualAccount");
  const va = await rail.createVirtualAccount({
    chargeId: "smoke",
    amountKobo: 500000n,
    customerName: "Smoke Test",
    reference: `smoke_va_${Date.now()}`,
  });
  console.log("  ", va);

  console.log("\n[4] initiateCheckout (card/USSD)");
  const init = await rail.initiateCheckout({
    chargeId: "smoke",
    amountKobo: 500000n,
    reference: `cg_smoke_${Date.now()}`,
    callbackUrl: "https://neflo.torama.money/pay/smoke",
  });
  console.log("  ", init);

  console.log("\n[5] verifyTransaction");
  console.log("  ", await rail.verifyTransaction(`cg_smoke_${Date.now()}`));

  console.log("\n[smoke] done.");
}

main().catch((e) => {
  console.error("[smoke] failed:", e);
  process.exit(1);
});
