import { ethers } from "ethers";
import type { Asset, Chain } from "@prisma/client";
import { prisma } from "./db";
import {
  EVM_CHAINS,
  EVM_CHAIN_ID,
  STABLECOIN_DECIMALS,
  TOKEN_CONTRACTS,
  evmRpcUrl,
} from "./chains";
import { creditDeposit } from "./credit";
import { retryDueWebhooks } from "./webhook";

export const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const MIN_CONF = () => Number(process.env.MIN_CONFIRMATIONS ?? 12);

/** Deposit-address row (id + address + owning merchant). */
export type WatchedAddress = { id: string; address: string; merchantId: string };

/** Load the deposit addresses we watch on a chain, keyed by lowercase address. */
export async function loadWatchedAddresses(
  chain: Chain,
): Promise<Map<string, WatchedAddress>> {
  const rows = await prisma.depositAddress.findMany({
    where: { chain },
    select: { id: true, address: true, merchantId: true },
  });
  return new Map(rows.map((a) => [a.address.toLowerCase(), a]));
}

/**
 * Record a deposit from a single ERC-20 Transfer log if its `to` is one of ours.
 * Shared by the polling scanner and the real-time WebSocket watcher; idempotent
 * on (chain, txHash). Returns true when a new deposit row was created.
 */
export async function processEvmTransferLog(
  chain: Chain,
  asset: Asset,
  log: { topics: ReadonlyArray<string>; data: string; transactionHash: string },
  byAddress: Map<string, WatchedAddress>,
): Promise<boolean> {
  const toTopic = log.topics[2]?.toLowerCase();
  const to = toTopic ? "0x" + toTopic.slice(26) : "";
  const owned = byAddress.get(to);
  if (!owned) return false;
  const value = BigInt(log.data);
  const amount = formatUnits(value, STABLECOIN_DECIMALS);
  const fromTopic = log.topics[1];
  const from = fromTopic ? "0x" + fromTopic.slice(26) : null;
  return recordDeposit({
    merchantId: owned.merchantId,
    addressId: owned.id,
    chain,
    asset,
    txHash: log.transactionHash,
    fromAddress: from,
    amount,
  });
}
/**
 * The deposit monitor. Two responsibilities:
 *   1. detect new inbound USDT/USDC transfers to our deposit addresses
 *   2. advance confirmations and credit confirmed deposits
 *
 * Designed to be invoked on a schedule (cron / the /api/internal/scan route /
 * scripts/monitor.ts loop). All writes are idempotent on (chain, txHash).
 */
export async function runMonitor(): Promise<{
  detected: number;
  credited: number;
}> {
  let detected = 0;
  for (const chain of EVM_CHAINS) {
    detected += await scanEvmChain(chain);
  }
  detected += await scanTron();
  const credited = await settleConfirmed();
  // Piggyback webhook retries on the same timer.
  await retryDueWebhooks().catch((e) =>
    console.error("[monitor] webhook retry failed", e),
  );
  return { detected, credited };
}

// ---------------------------------------------------------------------------
// EVM (Ethereum, Polygon)
// ---------------------------------------------------------------------------

/** A JsonRpcProvider with a PINNED network, so ethers never enters the
 *  "failed to detect network — retry in 1s" loop on a bad/unauthorized RPC. */
function evmProvider(chain: Chain): ethers.JsonRpcProvider {
  const id = EVM_CHAIN_ID[chain];
  const net = id ? new ethers.Network(chain, id) : undefined;
  return new ethers.JsonRpcProvider(evmRpcUrl(chain), net, {
    staticNetwork: net,
  });
}

// Free-tier RPC plans (e.g. Alchemy) cap eth_getLogs to a small block span — 10
// by default — so we scan in windows of EVM_GETLOGS_RANGE blocks rather than one
// big request. To bound work per tick we never look back more than
// EVM_GETLOGS_MAX_SPAN blocks; the real-time WebSocket watcher covers anything
// more recent, and this poller is only a backfill. Both write idempotently.
const GETLOGS_RANGE = () => Math.max(1, Number(process.env.EVM_GETLOGS_RANGE ?? 10));
const GETLOGS_MAX_SPAN = () =>
  Math.max(1, Number(process.env.EVM_GETLOGS_MAX_SPAN ?? 200));

async function scanEvmChain(chain: Chain): Promise<number> {
  const byAddress = await loadWatchedAddresses(chain);
  if (byAddress.size === 0) return 0;

  const provider = evmProvider(chain);
  const range = GETLOGS_RANGE();
  let found = 0;
  let scanned = -1; // highest block fully scanned this tick
  let fromBlock = 0;
  try {
    const tip = await provider.getBlockNumber();

    const cursor = await prisma.monitorCursor.findUnique({ where: { chain } });
    fromBlock = cursor ? Number(cursor.lastBlock) + 1 : Math.max(0, tip - range);
    if (fromBlock > tip) return 0;
    // Don't replay the whole chain if we've fallen far behind a disconnect.
    if (tip - fromBlock > GETLOGS_MAX_SPAN()) fromBlock = tip - GETLOGS_MAX_SPAN();
    scanned = fromBlock - 1;

    const ownedTopics = [...byAddress.values()].map((a) =>
      ethers.zeroPadValue(a.address, 32).toLowerCase(),
    );

    for (let start = fromBlock; start <= tip; start += range) {
      const end = Math.min(start + range - 1, tip);
      for (const asset of ["USDT", "USDC"] as Asset[]) {
        const token = TOKEN_CONTRACTS[chain][asset];
        const logs = await provider.getLogs({
          address: token,
          fromBlock: start,
          toBlock: end,
          topics: [TRANSFER_TOPIC, null, ownedTopics],
        });
        for (const log of logs) {
          if (await processEvmTransferLog(chain, asset, log, byAddress)) found++;
        }
      }
      scanned = end; // persist progress so a mid-loop failure isn't replayed
    }
    return found;
  } catch (e) {
    // One concise line per failed tick — never a flood. Other chains + TRON +
    // settlement still run.
    console.warn(`[monitor] ${chain} scan skipped: ${(e as Error).message}`);
    return found;
  } finally {
    if (scanned >= fromBlock) {
      await prisma.monitorCursor
        .upsert({
          where: { chain },
          create: { chain, lastBlock: BigInt(scanned) },
          update: { lastBlock: BigInt(scanned), lastScanAt: new Date() },
        })
        .catch(() => {});
    }
    provider.destroy();
  }
}

// ---------------------------------------------------------------------------
// TRON (TRC20 via TronGrid)
// ---------------------------------------------------------------------------

async function scanTron(): Promise<number> {
  const addresses = await prisma.depositAddress.findMany({
    where: { chain: "TRON" },
    select: { id: true, address: true, merchantId: true },
  });
  if (addresses.length === 0) return 0;

  const host = process.env.TRON_FULL_HOST ?? "https://api.trongrid.io";
  const headers: Record<string, string> = {};
  if (process.env.TRONGRID_API_KEY) {
    headers["TRON-PRO-API-KEY"] = process.env.TRONGRID_API_KEY;
  }

  const contracts = new Set(
    (["USDT", "USDC"] as Asset[]).map((a) => TOKEN_CONTRACTS.TRON[a]),
  );
  const assetByContract = new Map<string, Asset>([
    [TOKEN_CONTRACTS.TRON.USDT, "USDT"],
    [TOKEN_CONTRACTS.TRON.USDC, "USDC"],
  ]);

  let found = 0;
  for (const addr of addresses) {
    const url = `${host}/v1/accounts/${addr.address}/transactions/trc20?only_to=true&limit=50`;
    const res = await fetch(url, { headers });
    if (!res.ok) continue;
    const data = (await res.json()) as { data?: TronTrc20Tx[] };
    for (const tx of data.data ?? []) {
      const contract = tx.token_info?.address ?? "";
      if (!contracts.has(contract)) continue;
      if (tx.to !== addr.address) continue;
      const asset = assetByContract.get(contract);
      if (!asset) continue;
      const decimals = tx.token_info?.decimals ?? STABLECOIN_DECIMALS;
      const amount = formatUnits(BigInt(tx.value), decimals);
      const created = await recordDeposit({
        merchantId: addr.merchantId,
        addressId: addr.id,
        chain: "TRON",
        asset,
        txHash: tx.transaction_id,
        fromAddress: tx.from ?? null,
        amount,
      });
      if (created) found++;
    }
  }
  return found;
}

type TronTrc20Tx = {
  transaction_id: string;
  from?: string;
  to?: string;
  value: string;
  token_info?: { address?: string; decimals?: number };
};

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

async function recordDeposit(params: {
  merchantId: string;
  addressId: string;
  chain: Chain;
  asset: Asset;
  txHash: string;
  fromAddress: string | null;
  amount: string;
}): Promise<boolean> {
  try {
    await prisma.stablecoinDeposit.create({
      data: {
        merchantId: params.merchantId,
        addressId: params.addressId,
        chain: params.chain,
        asset: params.asset,
        txHash: params.txHash,
        fromAddress: params.fromAddress,
        amount: params.amount,
        status: "DETECTED",
      },
    });
    return true;
  } catch {
    // Unique (chain, txHash) violation → already recorded. Idempotent.
    return false;
  }
}

/**
 * Promote DETECTED deposits to CONFIRMED once they have enough confirmations,
 * then credit them. For simplicity we treat presence on-chain across a scan
 * cycle as confirmation progress; production can re-query receipts per tx.
 */
async function settleConfirmed(): Promise<number> {
  const pending = await prisma.stablecoinDeposit.findMany({
    where: { status: { in: ["DETECTED", "CONFIRMED"] } },
    take: 100,
  });

  let credited = 0;
  for (const dep of pending) {
    const confs = dep.confirmations + 1;
    if (confs < MIN_CONF()) {
      await prisma.stablecoinDeposit.update({
        where: { id: dep.id },
        data: { confirmations: confs },
      });
      continue;
    }
    if (dep.status !== "CREDITED") {
      await creditDeposit(dep.id);
      credited++;
    }
  }
  return credited;
}

// ethers v6 formatUnits returns a string; keep a thin wrapper for clarity.
function formatUnits(value: bigint, decimals: number): string {
  return ethers.formatUnits(value, decimals);
}
