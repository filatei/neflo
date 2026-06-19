import { NextResponse } from "next/server";
import { runMonitor } from "@/lib/monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Deposit monitor trigger. Protect with INTERNAL_SECRET so only the cron /
 * scheduler on the box (or scripts/monitor.ts) can run it.
 *   curl -X POST -H "X-Internal-Secret: $INTERNAL_SECRET" https://neflo.torama.money/api/internal/scan
 */
export async function POST(req: Request) {
  const secret = process.env.INTERNAL_SECRET;
  if (secret) {
    const provided = req.headers.get("x-internal-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  try {
    const result = await runMonitor();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[scan] failed", e);
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
