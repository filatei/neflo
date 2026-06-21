import { EventEmitter } from "events";

/**
 * In-process pub/sub for TapPay live updates, consumed by the SSE route. Each
 * session has a room keyed by sessionId. This works because Neflo runs as a
 * single long-lived Next.js container; if the app is ever scaled horizontally,
 * replace the emitter with Postgres LISTEN/NOTIFY (same publish/subscribe API).
 */

export type TapPayLiveEvent =
  | "scanned"
  | "paid"
  | "failed"
  | "cancelled"
  | "expired";

export type TapPayEventPayload = {
  type: TapPayLiveEvent;
  sessionId: string;
  amountMinor?: string; // string — SSE/JSON has no bigint
  ref?: string;
  at: string;
};

const bus = new EventEmitter();
bus.setMaxListeners(0); // many concurrent SSE subscribers

const room = (sessionId: string) => `tappay:${sessionId}`;

export function publish(
  sessionId: string,
  type: TapPayLiveEvent,
  extra: { amountMinor?: bigint; ref?: string } = {},
): void {
  const payload: TapPayEventPayload = {
    type,
    sessionId,
    amountMinor: extra.amountMinor?.toString(),
    ref: extra.ref,
    at: new Date().toISOString(),
  };
  bus.emit(room(sessionId), payload);
}

export function subscribe(
  sessionId: string,
  handler: (payload: TapPayEventPayload) => void,
): () => void {
  const key = room(sessionId);
  bus.on(key, handler);
  return () => bus.off(key, handler);
}
