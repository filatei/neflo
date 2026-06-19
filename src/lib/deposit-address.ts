import type { Chain } from "@prisma/client";
import { prisma } from "./db";
import { deriveAddress } from "./hdwallet";

/**
 * Return a merchant's deposit address for a chain, deriving a fresh one from
 * the master seed if it doesn't exist yet. The BIP44 derivation index is a
 * global monotonic counter (one address per index across all chains) so each
 * derived key is unique and recoverable from WALLET_MNEMONIC alone.
 */
export async function getOrCreateDepositAddress(
  merchantId: string,
  chain: Chain,
) {
  const existing = await prisma.depositAddress.findFirst({
    where: { merchantId, chain },
  });
  if (existing) return existing;

  // Next global derivation index.
  const last = await prisma.depositAddress.aggregate({
    _max: { derivationIx: true },
  });
  const derivationIx = (last._max.derivationIx ?? -1) + 1;
  const address = await deriveAddress(chain, derivationIx);

  return prisma.depositAddress.create({
    data: { merchantId, chain, address, derivationIx },
  });
}
