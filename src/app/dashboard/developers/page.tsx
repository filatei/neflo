import { prisma } from "@/lib/db";
import { getCurrentMerchant } from "@/lib/merchant";
import { DevelopersClient } from "@/components/DevelopersClient";

export const dynamic = "force-dynamic";

export default async function DevelopersPage() {
  const merchant = await getCurrentMerchant();
  if (!merchant) return null;

  const keys = await prisma.apiKey.findMany({
    where: { merchantId: merchant.id, revokedAt: null },
    select: { id: true, label: true, prefix: true, mode: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Developers</h1>
        <p className="text-sm font-medium text-ink-500">
          API keys for accepting payments programmatically. Secrets are shown
          once at creation.
        </p>
      </div>
      <DevelopersClient
        initialKeys={keys.map((k) => ({
          ...k,
          createdAt: k.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
