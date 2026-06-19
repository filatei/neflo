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
  const [method, setMethod] = useState<"crypto" | "naira">("crypto");
  const [chain, setChain] = useState<Chain>("TRON");
  const [address, setAddress] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const [naira, setNaira] = useState<{
    accountNumber: string;
    bankName: string;
    accountName: string;
  } | null>(null);
  const [nairaLoading, setNairaLoading] = useState(false);

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

  async function showNaira() {
    setNairaLoading(true);
    try {
      const res = await fetch("/api/merchant/virtual-account", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not get account");
      setNaira(data);
    } catch (e) {
      error((e as Error).message);
    } finally {
      setNairaLoading(false);
    }
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      success(`${label} copied`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      error("Couldn't copy — select manually");
    }
  }

  return (
    <div className="space-y-4">
      {/* Method toggle */}
      <div className="grid max-w-sm grid-cols-2 gap-2">
        {(
          [
            ["crypto", "Crypto (USDT/USDC)"],
            ["naira", "Naira (₦)"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={
              "rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 " +
              (method === m
                ? "border-black bg-ink-50"
                : "border-ink-200 hover:bg-ink-50")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {method === "crypto" && (
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
                <button
                  onClick={() => copyText(address, "Address")}
                  className="btn-secondary mt-4"
                >
                  {copied ? "Copied ✓" : "Copy address"}
                </button>
                <p className="mt-3 text-xs font-medium text-ink-400">
                  Send only {chain === "TRON" ? "TRC20" : "ERC20"} USDT or USDC
                  to this address.
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
      )}

      {method === "naira" && (
        <div className="card max-w-md">
          <p className="label">Your Naira deposit account</p>
          <p className="mt-1 text-sm font-medium text-ink-500">
            Share this account number to receive Naira by bank transfer. Funds
            credit your balance automatically.
          </p>
          {!naira ? (
            <button
              onClick={showNaira}
              className="btn-primary mt-4 w-full"
              disabled={nairaLoading}
            >
              {nairaLoading ? "Getting account…" : "Show Naira account"}
            </button>
          ) : (
            <div className="mt-4 space-y-3">
              <Row label="Bank" value={naira.bankName} />
              <Row
                label="Account number"
                value={naira.accountNumber}
                mono
                onCopy={() => copyText(naira.accountNumber, "Account number")}
              />
              <Row label="Account name" value={naira.accountName} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">
          {label}
        </p>
        <p className={"truncate text-sm font-bold " + (mono ? "font-mono" : "")}>
          {value}
        </p>
      </div>
      {onCopy && (
        <button className="btn-ghost px-2 py-1 text-xs" onClick={onCopy}>
          Copy
        </button>
      )}
    </div>
  );
}
