import { prisma } from "@/lib/db";
import { getCurrentMerchant } from "@/lib/merchant";
import { getBalanceMinor } from "@/lib/ledger";
import { PayoutsClient } from "@/components/PayoutsClient";

export const dynamic = "force-dynamic";

export default async function PayoutsPage() {
  const merchant = await getCurrentMerchant();
  if (!merchant) return null;

  const [balanceMinor, payouts] = await Promise.all([
    getBalanceMinor(merchant.id, "NGN"),
    prisma.payout.findMany({
      where: { merchantId: merchant.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payouts</h1>
        <p className="text-sm font-medium text-ink-500">
          Withdraw your NGN balance to a bank account.
        </p>
      </div>
      <PayoutsClient
        availableNgn={Number(balanceMinor) / 100}
        payouts={payouts.map((p) => ({
          id: p.id,
          amount: Number(p.amountKobo) / 100,
          accountNumber: p.accountNumber,
          accountName: p.accountName,
          status: p.status,
          failureReason: p.failureReason,
          createdAt: p.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
