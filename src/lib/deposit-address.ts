import type { Chain } from "@prisma/client";
import { prisma } from "./db";
import { deriveAddress } from "./hdwallet";

/**
 * Next global BIP44 derivation index (one address per index across all chains)
 * so each derived key is unique and recoverable from WALLET_MNEMONIC alone.
 */
async function nextDerivationIndex(): Promise<number> {
  const last = await prisma.depositAddress.aggregate({
    _max: { derivationIx: true },
  });
  return (last._max.derivationIx ?? -1) + 1;
}

/**
 * Create a fresh deposit address, optionally bound to a charge. Retries once on
 * a derivation-index collision (two concurrent creates racing for the same ix).
 */
async function createDepositAddress(params: {
  merchantId: string;
  chain: Chain;
  chargeId?: string;
}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const derivationIx = await nextDerivationIndex();
    const address = await deriveAddress(params.chain, derivationIx);
    try {
      return await prisma.depositAddress.create({
        data: {
          merchantId: params.merchantId,
          chargeId: params.chargeId,
          chain: params.chain,
          address,
          derivationIx,
        },
      });
    } catch (e) {
      // Unique (chain, derivationIx) collision — retry with a new index.
      if (attempt === 2) throw e;
    }
  }
  throw new Error("could not allocate deposit address");
}

/**
 * Merchant-level reusable address for a chain (dashboard "Receive" flow).
 */
export async function getOrCreateDepositAddress(
  merchantId: string,
  chain: Chain,
) {
  const existing = await prisma.depositAddress.findFirst({
    where: { merchantId, chain, chargeId: null },
  });
  if (existing) return existing;
  return createDepositAddress({ merchantId, chain });
}

/**
 * Unique address for a specific charge + chain (hosted checkout). One per
 * (charge, chain) so a payment can be attributed to exactly one charge.
 */
export async function getOrCreateChargeAddress(
  charge: { id: string; merchantId: string },
  chain: Chain,
) {
  const existing = await prisma.depositAddress.findFirst({
    where: { chargeId: charge.id, chain },
  });
  if (existing) return existing;
  return createDepositAddress({
    merchantId: charge.merchantId,
    chain,
    chargeId: charge.id,
  });
}
