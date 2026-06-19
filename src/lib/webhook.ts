import { createHmac } from "crypto";
import { prisma } from "./db";

/**
 * Webhook delivery with persistence + retry.
 *
 * deliverWebhook(): creates a WebhookDelivery row per active endpoint and makes
 * the first attempt immediately. Failures are retried on a backoff schedule by
 * retryDueWebhooks(), which the deposit-scan timer calls every cycle.
 */

// Backoff (minutes) for attempts 1..N. After this many attempts we give up.
const RETRY_DELAYS_MIN = [1, 5, 30, 120, 360];
const MAX_ATTEMPTS = RETRY_DELAYS_MIN.length + 1;

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

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
      const delivery = await prisma.webhookDelivery.create({
        data: { endpointId: ep.id, merchantId, event, payload },
      });
      await attemptDelivery(delivery.id);
    }),
  );
}

/** Make one delivery attempt and record the outcome + next retry. */
async function attemptDelivery(deliveryId: string) {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true },
  });
  if (!delivery || delivery.status === "SUCCESS") return;
  if (!delivery.endpoint.active) return;

  const attempt = delivery.attempts + 1;
  const signature = sign(delivery.endpoint.secret, delivery.payload);

  let responseStatus: number | null = null;
  let ok = false;
  let lastError: string | null = null;

  try {
    const res = await fetch(delivery.endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Neflo-Signature": signature,
        "X-Neflo-Event": delivery.event,
        "X-Neflo-Delivery": delivery.id,
      },
      body: delivery.payload,
      signal: AbortSignal.timeout(8000),
    });
    responseStatus = res.status;
    ok = res.ok;
    if (!ok) lastError = `HTTP ${res.status}`;
  } catch (e) {
    lastError = (e as Error).message;
  }

  if (ok) {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "SUCCESS",
        attempts: attempt,
        responseStatus,
        deliveredAt: new Date(),
        nextRetryAt: null,
        lastError: null,
      },
    });
    return;
  }

  const giveUp = attempt >= MAX_ATTEMPTS;
  const delayMin = RETRY_DELAYS_MIN[attempt - 1] ?? null;
  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: giveUp ? "FAILED" : "PENDING",
      attempts: attempt,
      responseStatus,
      lastError,
      nextRetryAt:
        giveUp || delayMin === null
          ? null
          : new Date(Date.now() + delayMin * 60_000),
    },
  });
}

/**
 * Retry deliveries that are due. Called from the scan timer each cycle.
 * Returns the number of deliveries retried.
 */
export async function retryDueWebhooks(): Promise<number> {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: "PENDING", nextRetryAt: { lte: new Date() } },
    take: 50,
    orderBy: { nextRetryAt: "asc" },
  });
  for (const d of due) {
    await attemptDelivery(d.id);
  }
  return due.length;
}
