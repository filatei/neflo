import { prisma } from "@/lib/db";
import { getCurrentMerchant } from "@/lib/merchant";
import { PaymentsClient } from "@/components/PaymentsClient";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const merchant = await getCurrentMerchant();
  if (!merchant) return null;

  const charges = await prisma.charge.findMany({
    where: { merchantId: merchant.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payment links</h1>
        <p className="text-sm font-medium text-ink-500">
          Create a shareable checkout link. Customers pay in USDT/USDC; you settle
          in {merchant.settlementCcy}.
        </p>
      </div>
      <PaymentsClient
        charges={charges.map((c) => ({
          id: c.id,
          amountUsd: Number(c.amountUsd),
          paidUsd: Number(c.paidUsd),
          description: c.description,
          status: c.status,
          createdAt: c.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
