// Next.js calls register() once when the server process starts (Node runtime).
// We use it to launch the real-time WebSocket deposit watcher. It's opt-in:
// without ETH_WSS_URL / POLYGON_WSS_URL set, startDepositWatcher() is a no-op,
// so this is inert until you configure a wss:// RPC.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { startDepositWatcher } = await import("./lib/depositWatcher");
    startDepositWatcher();
  } catch (e) {
    console.warn("[instrumentation] deposit watcher start failed:", e);
  }
}
