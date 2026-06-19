import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentMerchant } from "@/lib/merchant";
import { getBalanceMinor } from "@/lib/ledger";
import { formatMinor, timeAgo } from "@/lib/format";
import { CHAIN_LABEL } from "@/lib/chains";
import { VolumeBars } from "@/components/VolumeBars";

export const dynamic = "force-dynamic";

const DAYS = 14;
const since = () => new Date(Date.now() - DAYS * 86_400_000);
const dayKey = (d: Date) => d.toISOString().slice(5, 10); // MM-DD

export default async function OverviewPage() {
  const merchant = await getCurrentMerchant();
  if (!merchant) return null;

  const from = since();
  const [balanceMinor, deposits, ngn, payouts] = await Promise.all([
    getBalanceMinor(merchant.id, "NGN"),
    prisma.stablecoinDeposit.findMany({
      where: { merchantId: merchant.id, detectedAt: { gte: from } },
      include: { conversion: true },
      orderBy: { detectedAt: "desc" },
    }),
    prisma.ngnPayment.findMany({
      where: { merchantId: merchant.id, createdAt: { gte: from } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.payout.findMany({
      where: { merchantId: merchant.id, createdAt: { gte: from } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Received (NGN) total + per-day series.
  const buckets = new Map<string, number>();
  for (let i = DAYS - 1; i >= 0; i--) {
    buckets.set(dayKey(new Date(Date.now() - i * 86_400_000)), 0);
  }
  let receivedNgn = 0;
  for (const p of ngn) {
    const v = Number(p.amountKobo) / 100;
    receivedNgn += v;
    const k = dayKey(p.createdAt);
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + v);
  }
  for (const d of deposits) {
    if (!d.conversion) continue;
    const v = Number(d.conversion.localAmount);
    receivedNgn += v;
    const k = dayKey(d.detectedAt);
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + v);
  }
  const series = [...buckets.entries()].map(([label, value]) => ({ label, value }));

  const paidOut = payouts
    .filter((p) => p.status === "PAID" || p.status === "PROCESSING")
    .reduce((s, p) => s + Number(p.amountKobo) / 100, 0);
  const paymentCount = ngn.length + deposits.length;

  // Unified recent activity (in + out).
  type Act = { id: string; label: string; sub: string; amount: string; out?: boolean; at: Date };
  const activity: Act[] = [
    ...deposits.map((d) => ({
      id: d.id,
      label: `${Number(d.amount).toFixed(2)} ${d.asset}`,
      sub: CHAIN_LABEL[d.chain],
      amount: d.conversion
        ? formatMinor(BigInt(Math.round(Number(d.conversion.localAmount) * 100)), "NGN")
        : "—",
      at: d.detectedAt,
    })),
    ...ngn.map((p) => ({
      id: p.id,
      label: p.method === "card" ? "Card / USSD" : "Bank transfer",
      sub: p.provider,
      amount: formatMinor(p.amountKobo, "NGN"),
      at: p.createdAt,
    })),
    ...payouts.map((p) => ({
      id: p.id,
      label: "Payout",
      sub: `${p.accountName} · ${p.status}`,
      amount: formatMinor(p.amountKobo, "NGN"),
      out: true,
      at: p.createdAt,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8);

  const fmt = (n: number) =>
    `₦${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{merchant.name}</h1>
          <p className="text-sm font-medium text-ink-500">
            Last {DAYS} days · settles in {merchant.settlementCcy}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/payments" className="btn-secondary">
            New payment link
          </Link>
          <Link href="/dashboard/payouts" className="btn-primary">
            Withdraw
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Available balance" value={formatMinor(balanceMinor, "NGN")} big />
        <Stat label="Received (14d)" value={fmt(receivedNgn)} />
        <Stat label="Paid out (14d)" value={fmt(paidOut)} />
        <Stat label="Payments (14d)" value={String(paymentCount)} />
      </div>

      <section className="card">
        <p className="label">Received volume</p>
        <div className="mt-3">
          <VolumeBars data={series} />
        </div>
      </section>

      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Recent activity</h2>
          <Link href="/dashboard/transactions" className="text-sm font-bold text-ink-500 hover:text-black">
            View all
          </Link>
        </div>
        {activity.length === 0 ? (
          <p className="mt-6 text-sm font-medium text-ink-400">
            No activity yet. Share a payment link to start receiving.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-ink-100">
            {activity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{a.label}</p>
                  <p className="truncate text-xs font-medium text-ink-400">{a.sub}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">
                    {a.out ? "−" : "+"}
                    {a.amount}
                  </p>
                  <p className="text-[11px] font-medium text-ink-400">{timeAgo(a.at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  big,
}: {
  label: string;
  value: string;
  big?: boolean;
}) {
  return (
    <div className="card">
      <p className="label">{label}</p>
      <p
        className={
          "mt-1 font-extrabold tracking-tight " +
          (big ? "text-2xl" : "text-xl")
        }
      >
        {value}
      </p>
    </div>
  );
}
