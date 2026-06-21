import type { Asset, Chain } from "@prisma/client";

/**
 * Token contract addresses and decimals for the stablecoins we accept.
 * USDT/USDC are 6 decimals on all three chains.
 */
export const STABLECOIN_DECIMALS = 6;

type TokenMap = Record<Asset, string>;

export const TOKEN_CONTRACTS: Record<Chain, TokenMap> = {
  TRON: {
    // TRC20
    USDT: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    USDC: "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8",
  },
  ETHEREUM: {
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  POLYGON: {
    USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  },
};

export const CHAIN_LABEL: Record<Chain, string> = {
  TRON: "TRON (TRC20)",
  ETHEREUM: "Ethereum (ERC20)",
  POLYGON: "Polygon (ERC20)",
};

export const EVM_CHAINS: Chain[] = ["ETHEREUM", "POLYGON"];

/** Chain id per EVM chain — used to pin the provider network (no auto-detect). */
export const EVM_CHAIN_ID: Partial<Record<Chain, number>> = {
  ETHEREUM: 1,
  POLYGON: 137,
};

export function evmRpcUrl(chain: Chain): string {
  // `||` (not `??`) so an empty/"-" env value falls back to a working default.
  // PublicNode defaults — free public RPCs like llamarpc/polygon-rpc block VPS
  // IPs. For production prefer a dedicated Alchemy/Infura URL via the env var.
  if (chain === "ETHEREUM")
    return process.env.ETH_RPC_URL || "https://ethereum-rpc.publicnode.com";
  if (chain === "POLYGON")
    return process.env.POLYGON_RPC_URL || "https://polygon-bor-rpc.publicnode.com";
  throw new Error(`No EVM RPC for chain ${chain}`);
}

/**
 * Optional WebSocket RPC per chain (e.g. Alchemy `wss://…`). When set, the
 * deposit watcher subscribes to Transfer events in real time instead of
 * polling. Returns null when not configured (watcher stays off for that chain).
 */
export function evmWssUrl(chain: Chain): string | null {
  if (chain === "ETHEREUM") return process.env.ETH_WSS_URL || null;
  if (chain === "POLYGON") return process.env.POLYGON_WSS_URL || null;
  return null;
}

/** Which assets are offered on each chain in the UI. */
export const SUPPORTED: Array<{ chain: Chain; asset: Asset }> = [
  { chain: "TRON", asset: "USDT" },
  { chain: "TRON", asset: "USDC" },
  { chain: "ETHEREUM", asset: "USDT" },
  { chain: "ETHEREUM", asset: "USDC" },
  { chain: "POLYGON", asset: "USDT" },
  { chain: "POLYGON", asset: "USDC" },
];
