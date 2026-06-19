import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream for a charge's payment status. One long-lived
 * connection per checkout page replaces client polling — clients make no
 * repeat requests, so rate limiters never see a flood. The server checks the
 * charge internally and emits only on change, closing on PAID/EXPIRED.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let poll: ReturnType<typeof setInterval> | undefined;
      let hb: ReturnType<typeof setInterval> | undefined;
      let last = "";

      const close = () => {
        if (closed) return;
        closed = true;
        if (poll) clearInterval(poll);
        if (hb) clearInterval(hb);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          close();
        }
      };

      const tick = async () => {
        if (closed) return;
        const c = await prisma.charge.findUnique({
          where: { id },
          select: {
            status: true,
            paidUsd: true,
            amountUsd: true,
            successUrl: true,
          },
        });
        if (!c) {
          send({ error: "not_found" });
          close();
          return;
        }
        const payload = {
          status: c.status,
          paidUsd: Number(c.paidUsd),
          amountUsd: Number(c.amountUsd),
          successUrl: c.successUrl,
        };
        const key = `${c.status}:${payload.paidUsd}`;
        if (key !== last) {
          last = key;
          send(payload);
        }
        if (c.status === "PAID" || c.status === "EXPIRED") close();
      };

      // Initial state + internal check loop + keep-alive heartbeat.
      void tick();
      poll = setInterval(() => void tick(), 3000);
      hb = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch {
            close();
          }
        }
      }, 15000);

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Hint proxies not to buffer the stream.
      "X-Accel-Buffering": "no",
    },
  });
}
