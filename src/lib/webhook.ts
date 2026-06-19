import { createHmac } from "crypto";
import { prisma } from "./db";

/**
 * Deliver a signed event to all active webhook endpoints for a merchant.
 * Signature: hex HMAC-SHA256 of the raw JSON body, keyed by the endpoint
 * secret, sent in the `X-Neflo-Signature` header. Best-effort, non-blocking.
 */
export async function deliverWebhook(
  merchantId: string,
  event: string,
  data: unknown,
) {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { merchantId, active: true },
  });
  if (endpoints.length === 0) return;

  const payload = JSON.stringify({
    event,
    data,
    sentAt: new Date().toISOString(),
  });

  await Promise.allSettled(
    endpoints.map(async (ep) => {
      const signature = createHmac("sha256", ep.secret)
        .update(payload)
        .digest("hex");
      try {
        await fetch(ep.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Neflo-Signature": signature,
            "X-Neflo-Event": event,
          },
          body: payload,
          // Don't let a slow endpoint hold up crediting.
          signal: AbortSignal.timeout(8000),
        });
      } catch (e) {
        console.error(`[webhook] delivery to ${ep.url} failed`, e);
      }
    }),
  );
}
