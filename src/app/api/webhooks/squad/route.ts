import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getNgnRail } from "@/lib/rails";
import { creditNgnTransfer, creditCardPayment } from "@/lib/ngn";
import { markPayoutStatus } from "@/lib/payout";

export const dynamic = "force-dynamic";

/**
 * Squad transfer-notification webhook. Verifies the x-squad-signature
 * (HMAC-SHA512 of the raw body) before crediting. Idempotent on the provider's
 * transaction reference.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature =
    req.headers.get("x-squad-signature") ??
    req.headers.get("x-squad-encrypted-body");

  const rail = getNgnRail();
  if (!rail.verifySignature(raw, signature)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Squad wraps details under `data` (or sends them at the top level).
  const payload =
    (body as { data?: unknown }).data ?? (body as Record<string, unknown>);

  // Payout/transfer status updates reference our `po_…` payout reference.
  const ref =
    (payload as Record<string, unknown>).transaction_reference ??
    (payload as Record<string, unknown>).transaction_ref;
  if (typeof ref === "string" && ref.startsWith("po_")) {
    const rawStatus = String(
      (payload as Record<string, unknown>).transaction_status ??
        (payload as Record<string, unknown>).status ??
        "",
    ).toLowerCase();
    const status = rawStatus.includes("success")
      ? "PAID"
      : rawStatus.includes("fail") || rawStatus.includes("reverse")
        ? "FAILED"
        : null;
    if (status) {
      await markPayoutStatus(ref, status);
      return NextResponse.json({ ok: true, payout: status });
    }
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Card / USSD gateway success references our `cg_<chargeId>_<rand>`.
  // We don't trust the webhook body: confirm server-side and credit the amount
  // we recorded at initiation.
  if (typeof ref === "string" && ref.startsWith("cg_")) {
    const gtx = await prisma.gatewayTransaction.findUnique({
      where: { reference: ref },
    });
    if (!gtx || gtx.status === "SUCCESS") {
      return NextResponse.json({ ok: true, ignored: true });
    }
    const verified = await rail.verifyTransaction(ref);
    if (verified.status !== "success") {
      if (verified.status === "failed") {
        await prisma.gatewayTransaction.update({
          where: { reference: ref },
          data: { status: "FAILED" },
        });
      }
      return NextResponse.json({ ok: true, status: verified.status });
    }
    const credited = await creditCardPayment({
      chargeId: gtx.chargeId,
      transactionRef: ref,
      amountKobo: gtx.amountKobo,
    });
    await prisma.gatewayTransaction.update({
      where: { reference: ref },
      data: { status: "SUCCESS" },
    });
    return NextResponse.json({ ok: true, card: credited });
  }

  const transfer = rail.parseInbound(payload);
  if (!transfer) {
    // Acknowledge non-transfer events so Squad doesn't retry forever.
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const credited = await creditNgnTransfer(transfer);
    return NextResponse.json({ ok: true, credited });
  } catch (e) {
    console.error("[squad webhook] credit failed", e);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
