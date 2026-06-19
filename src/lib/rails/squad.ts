import { createHash, createHmac, timingSafeEqual } from "crypto";
import type {
  CreateVirtualAccountParams,
  InboundTransfer,
  NgnRail,
  VirtualAccountResult,
} from "./types";

/**
 * Squad (GTBank / HabariPay) NGN rail.
 *
 * Live mode activates when SQUAD_SECRET_KEY is set, hitting SQUAD_BASE_URL
 * (sandbox: https://sandbox-api-d.squadco.com, live: https://api-d.squadco.com).
 * Without a key it runs in MOCK mode: deterministic fake virtual accounts so
 * the full checkout/credit flow works end to end in dev and demos.
 *
 * NOTE: confirm the exact endpoint path and request/response field names
 * against https://docs.squadco.com before going live — they're isolated here
 * so only this file changes.
 */
export class SquadRail implements NgnRail {
  readonly name = "squad";

  private get key() {
    return process.env.SQUAD_SECRET_KEY ?? "";
  }
  private get base() {
    return process.env.SQUAD_BASE_URL || "https://sandbox-api-d.squadco.com";
  }
  private get live() {
    return this.key.length > 0;
  }

  async createVirtualAccount(
    p: CreateVirtualAccountParams,
  ): Promise<VirtualAccountResult> {
    if (!this.live) return mockAccount(p);

    const [firstName, ...rest] = p.customerName.split(" ");
    const res = await fetch(`${this.base}/virtual-accounts/transaction`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Verify field names against docs.squadco.com.
        amount: (Number(p.amountKobo) / 100).toFixed(2),
        transaction_reference: p.reference,
        customer_identifier: p.reference,
        first_name: firstName,
        last_name: rest.join(" ") || firstName,
        email: p.email ?? "",
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      throw new Error(`Squad VA creation failed (HTTP ${res.status})`);
    }
    const json = (await res.json()) as { data?: SquadVaData };
    const d = json.data ?? {};
    return {
      accountNumber: d.virtual_account_number ?? "",
      bankName: d.bank_name ?? "GTBank",
      accountName: d.account_name ?? p.customerName,
      providerRef: d.customer_identifier ?? p.reference,
    };
  }

  verifySignature(rawBody: string, signature: string | null): boolean {
    if (!signature) return !this.live; // mock mode accepts unsigned
    const expected = createHmac("sha512", this.key)
      .update(rawBody)
      .digest("hex");
    const a = Buffer.from(expected.toLowerCase());
    const b = Buffer.from(signature.toLowerCase());
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseInbound(body: unknown): InboundTransfer | null {
    const b = (body ?? {}) as Record<string, unknown>;
    // Squad transfer-notification fields (verify against docs).
    const accountNumber =
      (b.virtual_account_number as string) ??
      (b.account_number as string) ??
      "";
    const transactionRef =
      (b.transaction_reference as string) ??
      (b.transaction_ref as string) ??
      (b.reference as string) ??
      "";
    const amountRaw =
      (b.principal_amount as string | number) ??
      (b.amount as string | number) ??
      0;
    if (!accountNumber || !transactionRef) return null;
    // Amount arrives in Naira; convert to kobo.
    const amountKobo = BigInt(Math.round(Number(amountRaw) * 100));
    return { transactionRef, accountNumber, amountKobo };
  }
}

type SquadVaData = {
  virtual_account_number?: string;
  bank_name?: string;
  account_name?: string;
  customer_identifier?: string;
};

/** Deterministic mock account so demos work without Squad credentials. */
function mockAccount(p: CreateVirtualAccountParams): VirtualAccountResult {
  const digits = createHash("sha256")
    .update(p.reference)
    .digest("hex")
    .replace(/\D/g, "")
    .padEnd(10, "0")
    .slice(0, 10);
  return {
    accountNumber: digits,
    bankName: "Squad Sandbox Bank",
    accountName: `NEFLO/${p.customerName}`.slice(0, 40),
    providerRef: p.reference,
  };
}
