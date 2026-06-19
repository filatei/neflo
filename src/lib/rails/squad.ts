import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
import type {
  Bank,
  CreateVirtualAccountParams,
  InboundTransfer,
  NgnRail,
  ResolvedAccount,
  SendTransferParams,
  TransferResult,
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

  // ------------------------------------------------------------------ payouts
  async listBanks(): Promise<Bank[]> {
    if (!this.live) return MOCK_BANKS;
    const res = await fetch(`${this.base}/payout/banks`, {
      headers: { Authorization: `Bearer ${this.key}` },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return MOCK_BANKS;
    const json = (await res.json()) as { data?: Array<Record<string, string>> };
    const banks = (json.data ?? []).map((b) => ({
      name: b.name ?? b.bank_name ?? "",
      code: b.code ?? b.bank_code ?? "",
    }));
    return banks.length ? banks : MOCK_BANKS;
  }

  async resolveAccount(
    bankCode: string,
    accountNumber: string,
  ): Promise<ResolvedAccount> {
    if (!this.live) {
      return { accountName: `NEFLO TEST / ${accountNumber.slice(-4)}` };
    }
    const res = await fetch(`${this.base}/payout/account/lookup`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bank_code: bankCode,
        account_number: accountNumber,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`Account lookup failed (HTTP ${res.status})`);
    const json = (await res.json()) as { data?: { account_name?: string } };
    return { accountName: json.data?.account_name ?? "" };
  }

  async sendTransfer(p: SendTransferParams): Promise<TransferResult> {
    if (!this.live) {
      return { providerRef: `mock_${randomUUID()}`, status: "PAID" };
    }
    const res = await fetch(`${this.base}/payout/transfer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transaction_reference: p.reference,
        amount: String(p.amountKobo), // Squad transfer amount is in kobo
        bank_code: p.bankCode,
        account_number: p.accountNumber,
        account_name: p.accountName,
        currency_id: "NGN",
        remark: "Neflo payout",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { transaction_reference?: string };
      message?: string;
    };
    if (!res.ok || json.success === false) {
      return {
        providerRef: json.data?.transaction_reference ?? p.reference,
        status: "FAILED",
        failureReason: json.message ?? `HTTP ${res.status}`,
      };
    }
    return {
      providerRef: json.data?.transaction_reference ?? p.reference,
      status: "PROCESSING", // finalised by the transfer webhook
    };
  }
}

const MOCK_BANKS: Bank[] = [
  { name: "Guaranty Trust Bank", code: "058" },
  { name: "Access Bank", code: "044" },
  { name: "Zenith Bank", code: "057" },
  { name: "United Bank for Africa", code: "033" },
  { name: "First Bank of Nigeria", code: "011" },
  { name: "Wema Bank (ALAT)", code: "035" },
  { name: "Providus Bank", code: "101" },
  { name: "Kuda Microfinance Bank", code: "50211" },
  { name: "OPay", code: "999992" },
  { name: "Moniepoint MFB", code: "50515" },
];

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
