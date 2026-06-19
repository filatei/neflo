"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useToast } from "@/components/ui/Toast";

type Status = "PENDING" | "UNDERPAID" | "PAID" | "EXPIRED";
type Chain = "TRON" | "ETHEREUM" | "POLYGON";

const CHAINS: { id: Chain; label: string; std: string }[] = [
  { id: "TRON", label: "TRON", std: "TRC20" },
  { id: "ETHEREUM", label: "Ethereum", std: "ERC20" },
  { id: "POLYGON", label: "Polygon", std: "ERC20" },
];

export function CheckoutClient({
  id,
  merchantName,
  amountUsd,
  description,
  initialStatus,
  successUrl,
}: {
  id: string;
  merchantName: string;
  amountUsd: number;
  description?: string | null;
  initialStatus: Status;
  successUrl?: string | null;
}) {
  const { success, error } = useToast();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [paidUsd, setPaidUsd] = useState(0);
  const [chain, setChain] = useState<Chain | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Poll for payment while the charge is open.
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/pay/${id}/status`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setPaidUsd(data.paidUsd ?? 0);
      setStatus(data.status);
      if (data.status === "PAID" && successUrl) {
        window.setTimeout(() => {
          window.location.href = successUrl;
        }, 2500);
      }
    } catch {
      /* transient — keep polling */
    }
  }, [id, successUrl]);

  const done = status === "PAID" || status === "EXPIRED";
  const pollRef = useRef(poll);
  pollRef.current = poll;
  useEffect(() => {
    if (done) return;
    const t = window.setInterval(() => pollRef.current(), 5000);
    return () => window.clearInterval(t);
  }, [done]);

  async function pickChain(next: Chain) {
    setChain(next);
    setLoading(true);
    setAddress(null);
    setQr(null);
    try {
      const res = await fetch(`/api/pay/${id}/address`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not get address");
      setAddress(data.address);
      setQr(await QRCode.toDataURL(data.address, { margin: 1, width: 200 }));
    } catch (e) {
      error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      success("Address copied");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      error("Couldn't copy — copy manually");
    }
  }

  const amount = `$${amountUsd.toFixed(2)}`;

  if (status === "PAID") {
    return (
      <div className="card text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-black text-2xl font-bold">
          ✓
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Payment received</h1>
        <p className="mt-1 text-sm font-medium text-ink-500">
          {amount} paid to {merchantName}.
        </p>
        {successUrl && (
          <p className="mt-4 text-xs font-medium text-ink-400">Redirecting…</p>
        )}
      </div>
    );
  }

  if (status === "EXPIRED") {
    return (
      <div className="card text-center">
        <h1 className="text-2xl font-bold tracking-tight">Payment link expired</h1>
        <p className="mt-1 text-sm font-medium text-ink-500">
          Ask {merchantName} for a new link.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="text-sm font-bold text-ink-400">{merchantName}</p>
      <p className="mt-1 text-3xl font-extrabold tracking-tight">{amount}</p>
      {description && (
        <p className="mt-1 text-sm font-medium text-ink-500">{description}</p>
      )}
      <p className="mt-3 text-xs font-medium text-ink-400">
        Pay with USDT or USDC. {status === "UNDERPAID" &&
          `Received $${paidUsd.toFixed(2)} so far — send the remainder.`}
      </p>

      <div className="mt-5">
        <p className="label">Choose network</p>
        <div className="grid grid-cols-3 gap-2">
          {CHAINS.map((c) => (
            <button
              key={c.id}
              onClick={() => pickChain(c.id)}
              className={
                "rounded-xl border px-2 py-2.5 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 " +
                (chain === c.id
                  ? "border-black bg-ink-50"
                  : "border-ink-200 hover:bg-ink-50")
              }
            >
              <span className="block text-sm font-bold">{c.label}</span>
              <span className="block text-[10px] font-medium text-ink-400">
                {c.std}
              </span>
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p className="mt-6 text-center text-sm font-semibold text-ink-400">
          Generating address…
        </p>
      )}

      {address && !loading && (
        <div className="mt-5 flex flex-col items-center text-center">
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt="Payment address QR"
              width={200}
              height={200}
              className="rounded-xl border border-ink-100"
            />
          )}
          <p className="mt-3 break-all font-mono text-xs font-semibold">
            {address}
          </p>
          <button onClick={copy} className="btn-secondary mt-3">
            {copied ? "Copied ✓" : "Copy address"}
          </button>
          <p className="mt-3 flex items-center gap-2 text-xs font-medium text-ink-400">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ink-400" />
            Waiting for payment…
          </p>
          <p className="mt-1 text-[11px] font-medium text-ink-400">
            Send exactly {amount} of {chain === "TRON" ? "TRC20" : "ERC20"} USDT
            or USDC to this address.
          </p>
        </div>
      )}
    </div>
  );
}
