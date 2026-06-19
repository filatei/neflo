import { getUsdRate } from "./rate";

/**
 * Convert a USD-pegged stablecoin amount to local currency, applying our spread.
 * USDT/USDC are treated 1:1 with USD.
 *
 * spreadBps: basis points we keep (e.g. 150 = 1.50%).
 * Returns both the gross (mid-market) and net (after spread) figures.
 */
export async function quoteConversion(params: {
  usdAmount: number;
  localCcy?: string;
  spreadBps?: number;
}) {
  const localCcy = params.localCcy ?? "NGN";
  const spreadBps =
    params.spreadBps ?? Number(process.env.CONVERSION_SPREAD_BPS ?? 150);
  const rate = await getUsdRate(localCcy);

  const gross = params.usdAmount * rate;
  const spread = (gross * spreadBps) / 10_000;
  const net = gross - spread;

  return {
    localCcy,
    rate,
    spreadBps,
    grossLocal: round2(gross),
    spreadLocal: round2(spread),
    netLocal: round2(net),
    // minor units (kobo) for the ledger
    netMinor: BigInt(Math.round(net * 100)),
    spreadMinor: BigInt(Math.round(spread * 100)),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
