import { prisma } from "@/lib/db";
import { getCurrentMerchant } from "@/lib/merchant";
import { formatMinor, shortHash, timeAgo } from "@/lib/format";
import { CHAIN_LABEL } from "@/lib/chains";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const merchant = await getCurrentMerchant();
  if (!merchant) return null;

  const deposits = await prisma.stablecoinDeposit.findMany({
    where: { merchantId: merchant.id },
    orderBy: { detectedAt: "desc" },
    take: 100,
    include: { conversion: true },
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>

      {deposits.length === 0 ? (
        <div className="card">
          <p className="text-sm font-medium text-ink-400">
            No transactions yet.
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-xs font-bold uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3">Received</th>
                <th className="px-4 py-3">Network</th>
                <th className="px-4 py-3">Tx</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Credited</th>
                <th className="px-4 py-3 text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {deposits.map((d) => (
                <tr key={d.id} className="border-b border-ink-50">
                  <td className="px-4 py-3 font-bold">
                    {Number(d.amount).toFixed(2)} {d.asset}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink-500">
                    {CHAIN_LABEL[d.chain]}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-400">
                    {shortHash(d.txHash)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge">{d.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold">
                    {d.conversion
                      ? formatMinor(
                          BigInt(
                            Math.round(Number(d.conversion.localAmount) * 100),
                          ),
                          d.conversion.localCcy,
                        )
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-ink-400">
                    {timeAgo(d.detectedAt)}
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
