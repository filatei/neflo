import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentMerchant } from "@/lib/merchant";
import { formatMinor, shortHash, timeAgo } from "@/lib/format";
import { CHAIN_LABEL } from "@/lib/chains";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const merchant = await getCurrentMerchant();
  if (!merchant) return null;

  const [balances, deposits] = await Promise.all([
    prisma.merchantBalance.findMany({ where: { merchantId: merchant.id } }),
    prisma.stablecoinDeposit.findMany({
      where: { merchantId: merchant.id },
      orderBy: { detectedAt: "desc" },
      take: 6,
      include: { conversion: true },
    }),
  ]);

  const primary =
    balances.find((b) => b.ccy === merchant.settlementCcy) ?? balances[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{merchant.name}</h1>
          <p className="text-sm font-medium text-ink-500">
            Settlement currency: {merchant.settlementCcy}
          </p>
        </div>
        <Link href="/dashboard/deposit" className="btn-primary">
          Receive a deposit
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card sm:col-span-1">
          <p className="label">Available balance</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight">
            {primary
              ? formatMinor(primary.availableMinor, primary.ccy)
              : formatMinor(0n, merchant.settlementCcy)}
          </p>
        </div>
        <div className="card">
          <p className="label">Deposits</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight">
            {deposits.length}
          </p>
          <p className="text-sm font-medium text-ink-500">most recent shown below</p>
        </div>
        <div className="card">
          <p className="label">Status</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight">
            {merchant.status}
          </p>
        </div>
      </div>

      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Recent deposits</h2>
          <Link
            href="/dashboard/transactions"
            className="text-sm font-bold text-ink-500 hover:text-black"
          >
            View all
          </Link>
        </div>

        {deposits.length === 0 ? (
          <p className="mt-6 text-sm font-medium text-ink-400">
            No deposits yet. Generate a deposit address to start receiving
            stablecoins.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-ink-100">
            {deposits.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">
                    {Number(d.amount).toFixed(2)} {d.asset}
                    <span className="ml-2 font-medium text-ink-400">
                      {CHAIN_LABEL[d.chain]}
                    </span>
                  </p>
                  <p className="truncate font-mono text-xs text-ink-400">
                    {shortHash(d.txHash)} · {timeAgo(d.detectedAt)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="badge">{d.status}</span>
                  {d.conversion && (
                    <p className="mt-1 text-sm font-bold">
                      {formatMinor(
                        BigInt(Math.round(Number(d.conversion.localAmount) * 100)),
                        d.conversion.localCcy,
                      )}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
