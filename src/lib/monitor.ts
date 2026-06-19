import { ethers } from "ethers";
import type { Asset, Chain } from "@prisma/client";
import { prisma } from "./db";
import {
  EVM_CHAINS,
  STABLECOIN_DECIMALS,
  TOKEN_CONTRACTS,
  evmRpcUrl,
} from "./chains";
import { creditDeposit } from "./credit";

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const MIN_CONF = () => Number(process.env.MIN_CONFIRMATIONS ?? 12);

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
  return { detected, credited };
}

// ---------------------------------------------------------------------------
// EVM (Ethereum, Polygon)
// ---------------------------------------------------------------------------

async function scanEvmChain(chain: Chain): Promise<number> {
  const addresses = await prisma.depositAddress.findMany({
    where: { chain },
    select: { id: true, address: true, merchantId: true },
  });
  if (addresses.length === 0) return 0;

  const provider = new ethers.JsonRpcProvider(evmRpcUrl(chain));
  const tip = await provider.getBlockNumber();

  const cursor = await prisma.monitorCursor.findUnique({ where: { chain } });
  // Default: scan a small recent window on first run.
  const fromBlock = cursor ? Number(cursor.lastBlock) + 1 : Math.max(0, tip - 500);
  const toBlock = tip;
  if (fromBlock > toBlock) return 0;

  const byAddress = new Map(
    addresses.map((a) => [a.address.toLowerCase(), a]),
  );
  const ownedTopics = addresses.map((a) =>
    ethers.zeroPadValue(a.address, 32).toLowerCase(),
  );

  let found = 0;
  for (const asset of ["USDT", "USDC"] as Asset[]) {
    const token = TOKEN_CONTRACTS[chain][asset];
    // topic[2] is the indexed `to`; filter to our addresses.
    const logs = await provider.getLogs({
      address: token,
      fromBlock,
      toBlock,
      topics: [TRANSFER_TOPIC, null, ownedTopics],
    });
    for (const log of logs) {
      const toTopic = log.topics[2]?.toLowerCase();
      const to = toTopic ? "0x" + toTopic.slice(26) : "";
      const owned = byAddress.get(to);
      if (!owned) continue;
      const value = BigInt(log.data);
      const amount = formatUnits(value, STABLECOIN_DECIMALS);
      const fromTopic = log.topics[1];
      const from = fromTopic ? "0x" + fromTopic.slice(26) : null;

      const created = await recordDeposit({
        merchantId: owned.merchantId,
        addressId: owned.id,
        chain,
        asset,
        txHash: log.transactionHash,
        fromAddress: from,
        amount,
      });
      if (created) found++;
    }
  }

  await prisma.monitorCursor.upsert({
    where: { chain },
    create: { chain, lastBlock: BigInt(toBlock) },
    update: { lastBlock: BigInt(toBlock), lastScanAt: new Date() },
  });

  return found;
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
