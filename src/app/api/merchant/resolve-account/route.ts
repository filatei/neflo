import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentMerchant } from "@/lib/merchant";
import { getNgnRail } from "@/lib/rails";

const schema = z.object({
  bankCode: z.string().min(2).max(10),
  accountNumber: z.string().min(10).max(10),
});

/**
 * Turn a raw bank/Squad lookup error into a calm, human sentence — no HTTP
 * codes or stack-trace fragments shown to the merchant.
 */
function friendlyResolveError(raw: string): string {
  const m = (raw || "").toLowerCase();
  if (m.includes("not found") || m.includes("invalid account") || m.includes("cannot resolve") || m.includes("no record")) {
    return "We couldn't find that account. Please double-check the bank and the 10-digit account number.";
  }
  if (m.includes("timeout") || m.includes("timed out") || m.includes("aborted")) {
    return "The bank took too long to respond. Please try again in a moment.";
  }
  if (m.includes("502") || m.includes("503") || m.includes("unavailable") || m.includes("gateway")) {
    return "Bank verification is temporarily unavailable. Please try again shortly.";
  }
  if (m.includes("bank") && (m.includes("not found") || m.includes("invalid"))) {
    return "That bank isn't recognised. Please pick your bank from the list.";
  }
  return "We couldn't verify that account right now. Check the details, or enter the account name manually below.";
}

export async function POST(req: Request) {
  const merchant = await getCurrentMerchant();
  if (!merchant) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid 10-digit account number and pick a bank." },
      { status: 400 },
    );
  }
  try {
    const { accountName } = await getNgnRail().resolveAccount(
      parsed.data.bankCode,
      parsed.data.accountNumber,
    );
    if (!accountName) {
      return NextResponse.json(
        { error: "We couldn't find that account. Please check the bank and account number." },
        { status: 422 },
      );
    }
    return NextResponse.json({ accountName });
  } catch (e) {
    return NextResponse.json(
      { error: friendlyResolveError((e as Error).message) },
      { status: 502 },
    );
  }
}
