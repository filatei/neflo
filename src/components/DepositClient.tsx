"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { useToast } from "@/components/ui/Toast";

type Chain = "TRON" | "ETHEREUM" | "POLYGON";

const CHAINS: { id: Chain; label: string; assets: string }[] = [
  { id: "TRON", label: "TRON", assets: "USDT · USDC (TRC20)" },
  { id: "ETHEREUM", label: "Ethereum", assets: "USDT · USDC (ERC20)" },
  { id: "POLYGON", label: "Polygon", assets: "USDT · USDC (ERC20)" },
];

export function DepositClient() {
  const { success, error } = useToast();
  const [chain, setChain] = useState<Chain>("TRON");
  const [address, setAddress] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate(next: Chain) {
    setChain(next);
    setLoading(true);
    setAddress(null);
    setQr(null);
    try {
      const res = await fetch("/api/merchant/deposit-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not generate address");
      setAddress(data.address);
      setQr(await QRCode.toDataURL(data.address, { margin: 1, width: 220 }));
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
      success("Address copied to clipboard");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      error("Couldn't copy — select and copy manually");
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="card">
        <p className="label">Choose network</p>
        <div className="mt-2 space-y-2">
          {CHAINS.map((c) => (
            <button
              key={c.id}
              onClick={() => generate(c.id)}
              className={
                "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 " +
                (chain === c.id
                  ? "border-black bg-ink-50"
                  : "border-ink-200 hover:bg-ink-50")
              }
            >
              <span>
                <span className="block text-sm font-bold">{c.label}</span>
                <span className="block text-xs font-medium text-ink-400">
                  {c.assets}
                </span>
              </span>
              <span className="text-xs font-bold text-ink-400">
                {chain === c.id ? "Selected" : "Select"}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="card flex flex-col items-center justify-center text-center">
        {loading ? (
          <p className="py-16 text-sm font-semibold text-ink-400">
            Generating address…
          </p>
        ) : address ? (
          <>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr}
                alt="Deposit address QR code"
                width={220}
                height={220}
                className="rounded-xl border border-ink-100"
              />
            )}
            <p className="mt-4 break-all font-mono text-sm font-semibold">
              {address}
            </p>
            <button onClick={copy} className="btn-secondary mt-4">
              {copied ? "Copied ✓" : "Copy address"}
            </button>
            <p className="mt-3 text-xs font-medium text-ink-400">
              Send only {chain === "TRON" ? "TRC20" : "ERC20"} USDT or USDC to
              this address.
            </p>
          </>
        ) : (
          <button
            onClick={() => generate(chain)}
            className="btn-primary my-12"
          >
            Generate {chain} address
          </button>
        )}
      </div>
    </div>
  );
}
