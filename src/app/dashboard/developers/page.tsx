import { prisma } from "@/lib/db";
import { getCurrentMerchant } from "@/lib/merchant";
import { DevelopersClient } from "@/components/DevelopersClient";
import { WebhooksClient } from "@/components/WebhooksClient";

export const dynamic = "force-dynamic";

export default async function DevelopersPage() {
  const merchant = await getCurrentMerchant();
  if (!merchant) return null;

  const [keys, webhooks] = await Promise.all([
    prisma.apiKey.findMany({
      where: { merchantId: merchant.id, revokedAt: null },
      select: { id: true, label: true, prefix: true, mode: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.webhookEndpoint.findMany({
      where: { merchantId: merchant.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

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

      <WebhooksClient
        initial={webhooks.map((w) => ({
          id: w.id,
          url: w.url,
          secret: w.secret,
          active: w.active,
          createdAt: w.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
