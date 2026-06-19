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

      <details className="card">
        <summary className="cursor-pointer text-sm font-bold">API reference</summary>
        <p className="mt-3 text-sm font-medium text-ink-500">
          Base URL <code className="font-mono">{process.env.APP_URL ?? "https://neflo.torama.money"}/api/v1</code>.
          Authenticate with your secret key:{" "}
          <code className="font-mono">Authorization: Bearer nf_live_…</code>
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-3 font-mono text-xs">
{`# Create a charge -> returns a checkout_url to share
curl -X POST ${process.env.APP_URL ?? "https://neflo.torama.money"}/api/v1/charges \\
  -H "Authorization: Bearer nf_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"amount_usd": 50, "description": "Order #1234"}'

GET  /api/v1/charges          # list charges
GET  /api/v1/charges/:id      # fetch one
GET  /api/v1/balance          # balances per currency
GET  /api/v1/transactions     # received payments (crypto + transfer)`}
        </pre>
      </details>
    </div>
  );
}
