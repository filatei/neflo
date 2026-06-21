import { getCurrentMembership } from "@/lib/merchant";
import { getById } from "@/lib/tappay/session";
import { subscribe, type TapPayEventPayload } from "@/lib/tappay/events";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream for a TapPay session. The merchant subscribes on QR
 * display, the payer on the confirm screen; both receive scanned/paid/failed/
 * cancelled/expired in real time. Plain HTTP — passes cleanly through Cloudflare
 * and Caddy, needs no socket server. Polling `/status/[id]` is the fallback.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const m = await getCurrentMembership();
  if (!m) return new Response("unauthenticated", { status: 401 });

  const session = await getById(id);
  if (!session) return new Response("not_found", { status: 404 });

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      // Replay current status immediately so a late subscriber isn't stuck.
      send({ type: "status", sessionId: id, status: session.status, at: new Date().toISOString() });

      unsubscribe = subscribe(id, (payload: TapPayEventPayload) => {
        send(payload);
        // Close the stream once the session reaches a terminal state.
        if (["paid", "failed", "cancelled", "expired"].includes(payload.type)) {
          cleanup();
          controller.close();
        }
      });

      // Keep-alive comment every 25s so proxies don't drop an idle connection.
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 25_000);
    },
    cancel() {
      cleanup();
    },
  });

  function cleanup() {
    if (unsubscribe) unsubscribe();
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe = null;
    heartbeat = null;
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
