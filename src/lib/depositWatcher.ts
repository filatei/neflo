import { ethers } from "ethers";
import type { Asset, Chain } from "@prisma/client";
import { EVM_CHAINS, EVM_CHAIN_ID, TOKEN_CONTRACTS, evmWssUrl } from "./chains";
import { TRANSFER_TOPIC, loadWatchedAddresses, processEvmTransferLog } from "./monitor";

/**
 * Real-time deposit detection over WebSocket (eth_subscribe logs) instead of
 * polling getLogs every tick. Opt-in per chain: only runs when ETH_WSS_URL /
 * POLYGON_WSS_URL is set (e.g. an Alchemy `wss://…`). The polling scanner stays
 * on as a backfill for anything missed during a disconnect — both write
 * idempotently on (chain, txHash), so double-detection is harmless.
 */

let started = false;

export function startDepositWatcher(): void {
  if (started) return;
  started = true;
  for (const chain of EVM_CHAINS) {
    const wss = evmWssUrl(chain);
    if (wss) void watchChain(chain, wss);
  }
}

function watchChain(chain: Chain, wss: string): void {
  const id = EVM_CHAIN_ID[chain];
  const net = id ? new ethers.Network(chain, id) : undefined;
  const usdc = TOKEN_CONTRACTS[chain].USDC.toLowerCase();
  const tokens = [TOKEN_CONTRACTS[chain].USDT, TOKEN_CONTRACTS[chain].USDC];

  let provider: ethers.WebSocketProvider | null = null;
  let refresh: ReturnType<typeof setInterval> | null = null;
  let topicsKey = "";
  let reconnecting = false;

  const teardown = () => {
    if (refresh) clearInterval(refresh);
    refresh = null;
    try {
      provider?.removeAllListeners();
      void provider?.destroy();
    } catch {
      /* ignore */
    }
    provider = null;
  };

  const reconnect = () => {
    if (reconnecting) return;
    reconnecting = true;
    teardown();
    setTimeout(() => {
      reconnecting = false;
      connect();
    }, 5_000);
  };

  // (Re)subscribe to Transfers to our addresses; re-runs when the set changes.
  const subscribe = async () => {
    if (!provider) return;
    const byAddress = await loadWatchedAddresses(chain);
    const owned = [...byAddress.values()]
      .map((a) => ethers.zeroPadValue(a.address, 32).toLowerCase())
      .sort();
    const key = owned.join(",");
    if (key === topicsKey) return;
    topicsKey = key;
    await provider.removeAllListeners();
    if (owned.length === 0) return;
    const filter = { address: tokens, topics: [TRANSFER_TOPIC, null, owned] };
    await provider.on(filter, (log: ethers.Log) => {
      const asset: Asset = log.address.toLowerCase() === usdc ? "USDC" : "USDT";
      processEvmTransferLog(chain, asset, log, byAddress).catch(() => {});
    });
  };

  const connect = () => {
    teardown();
    try {
      provider = new ethers.WebSocketProvider(wss, net, { staticNetwork: net });
      const sock = provider.websocket as unknown as {
        onclose?: () => void;
        onerror?: () => void;
      };
      sock.onclose = () => reconnect();
      sock.onerror = () => reconnect();
      topicsKey = "";
      void subscribe()
        .then(() => console.info(`[watch] ${chain} live via WebSocket`))
        .catch((e) => {
          console.warn(`[watch] ${chain} subscribe failed: ${(e as Error).message}`);
          reconnect();
        });
      // Pick up newly-created deposit addresses without a full reconnect.
      refresh = setInterval(() => void subscribe().catch(() => {}), 60_000);
    } catch (e) {
      console.warn(`[watch] ${chain} connect failed: ${(e as Error).message}`);
      reconnect();
    }
  };

  connect();
}
