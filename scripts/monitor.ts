/**
 * Standalone deposit-monitor loop. Run as a long-lived process on the box:
 *   tsx scripts/monitor.ts
 * or rely on a cron hitting POST /api/internal/scan. This loop is handy for
 * local dev and as a systemd unit alongside Otuburu's services.
 */
import { runMonitor } from "../src/lib/monitor";

const INTERVAL_MS = Number(process.env.MONITOR_INTERVAL_MS ?? 15_000);

async function tick() {
  try {
    const r = await runMonitor();
    if (r.detected || r.credited) {
      console.log(
        `[monitor] detected=${r.detected} credited=${r.credited} @ ${new Date().toISOString()}`,
      );
    }
  } catch (e) {
    console.error("[monitor] error", e);
  }
}

async function main() {
  console.log(`[monitor] starting, interval ${INTERVAL_MS}ms`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await tick();
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main();
