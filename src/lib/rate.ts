/**
 * Live USD -> local currency FX.
 * Source: open.er-api.com (no API key, hourly refresh) — same source Otuburu uses.
 * Cached in-process for an hour; falls back to USD_TO_NGN_RATE seed.
 */
type RateCache = { ccy: string; rate: number; fetchedAt: number };

let cache: RateCache | null = null;
const TTL_MS = 60 * 60 * 1000; // 1 hour

export async function getUsdRate(localCcy = "NGN"): Promise<number> {
  const now = Date.now();
  if (cache && cache.ccy === localCcy && now - cache.fetchedAt < TTL_MS) {
    return cache.rate;
  }

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      // Revalidate hourly; keep it cheap on low bandwidth.
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        result?: string;
        rates?: Record<string, number>;
      };
      const rate = data.rates?.[localCcy];
      if (data.result === "success" && typeof rate === "number" && rate > 0) {
        cache = { ccy: localCcy, rate, fetchedAt: now };
        return rate;
      }
    }
  } catch {
    // fall through to seed
  }

  const seed = Number(process.env.USD_TO_NGN_RATE ?? 1600);
  return localCcy === "NGN" ? seed : seed;
}
