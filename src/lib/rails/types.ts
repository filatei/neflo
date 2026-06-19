// Provider-agnostic NGN collection rail. Squad is the first implementation;
// Interswitch / Wema / Providus can implement the same interface later.

export type CreateVirtualAccountParams = {
  chargeId: string;
  amountKobo: bigint;
  customerName: string;
  email?: string;
  // Our unique reference for this account (also used as idempotency key).
  reference: string;
};

export type VirtualAccountResult = {
  accountNumber: string;
  bankName: string;
  accountName: string;
  providerRef: string;
};

export type InboundTransfer = {
  // Provider's unique transaction id (idempotency key for crediting).
  transactionRef: string;
  // The account that received the funds, to map back to a charge.
  accountNumber: string;
  amountKobo: bigint;
};

export type Bank = { name: string; code: string };

export type ResolvedAccount = { accountName: string };

export type SendTransferParams = {
  amountKobo: bigint;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  reference: string;
};

export type TransferResult = {
  providerRef: string;
  status: "PAID" | "PROCESSING" | "FAILED";
  failureReason?: string;
};

export type InitiateCheckoutParams = {
  chargeId: string;
  amountKobo: bigint;
  email?: string;
  reference: string;
  callbackUrl: string;
};

export type CheckoutInit = {
  // Hosted payment-page URL to redirect the payer to. null => settle in mock.
  checkoutUrl: string | null;
  providerRef: string;
};

export interface NgnRail {
  readonly name: string;

  // --- collections (pay-in) ---
  createVirtualAccount(
    params: CreateVirtualAccountParams,
  ): Promise<VirtualAccountResult>;
  /** Card / USSD via the hosted payment gateway. */
  initiateCheckout(params: InitiateCheckoutParams): Promise<CheckoutInit>;
  /** Verify a webhook's signature header against the raw request body. */
  verifySignature(rawBody: string, signature: string | null): boolean;
  /** Normalise a provider webhook body into an InboundTransfer (or null). */
  parseInbound(body: unknown): InboundTransfer | null;

  // --- payouts (pay-out) ---
  listBanks(): Promise<Bank[]>;
  resolveAccount(
    bankCode: string,
    accountNumber: string,
  ): Promise<ResolvedAccount>;
  sendTransfer(params: SendTransferParams): Promise<TransferResult>;
}
