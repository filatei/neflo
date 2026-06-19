import { prisma } from "@/lib/db";
import { getCurrentMerchant } from "@/lib/merchant";
import { formatMinor, shortHash, timeAgo } from "@/lib/format";
import { CHAIN_LABEL } from "@/lib/chains";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  kind: "Crypto" | "Bank transfer";
  received: string;
  rail: string;
  ref: string;
  status: string;
  creditedMinor: bigint | null;
  ccy: string;
  at: Date;
};

export default async function TransactionsPage() {
  const merchant = await getCurrentMerchant();
  if (!merchant) return null;

  const [deposits, ngn] = await Promise.all([
    prisma.stablecoinDeposit.findMany({
      where: { merchantId: merchant.id },
      orderBy: { detectedAt: "desc" },
      take: 100,
      include: { conversion: true },
    }),
    prisma.ngnPayment.findMany({
      where: { merchantId: merchant.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const rows: Row[] = [
    ...deposits.map((d) => ({
      id: d.id,
      kind: "Crypto" as const,
      received: `${Number(d.amount).toFixed(2)} ${d.asset}`,
      rail: CHAIN_LABEL[d.chain],
      ref: shortHash(d.txHash),
      status: d.status,
      creditedMinor: d.conversion
        ? BigInt(Math.round(Number(d.conversion.localAmount) * 100))
        : null,
      ccy: d.conversion?.localCcy ?? merchant.settlementCcy,
      at: d.detectedAt,
    })),
    ...ngn.map((p) => ({
      id: p.id,
      kind: "Bank transfer" as const,
      received: formatMinor(p.amountKobo, "NGN"),
      rail: `Bank transfer · ${p.provider}`,
      ref: p.transactionRef,
      status: "CREDITED",
      creditedMinor: p.amountKobo,
      ccy: "NGN",
      at: p.createdAt,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>

      {rows.length === 0 ? (
        <div className="card">
          <p className="text-sm font-medium text-ink-400">No transactions yet.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-xs font-bold uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3">Received</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Ref</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Credited</th>
                <th className="px-4 py-3 text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-ink-50">
                  <td className="px-4 py-3 font-bold">{r.received}</td>
                  <td className="px-4 py-3 font-medium text-ink-500">{r.rail}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-400">
                    {r.ref}
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge">{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold">
                    {r.creditedMinor != null
                      ? formatMinor(r.creditedMinor, r.ccy)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-ink-400">
                    {timeAgo(r.at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
