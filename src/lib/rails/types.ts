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

export interface NgnRail {
  readonly name: string;
  createVirtualAccount(
    params: CreateVirtualAccountParams,
  ): Promise<VirtualAccountResult>;
  /** Verify a webhook's signature header against the raw request body. */
  verifySignature(rawBody: string, signature: string | null): boolean;
  /** Normalise a provider webhook body into an InboundTransfer (or null). */
  parseInbound(body: unknown): InboundTransfer | null;
}
