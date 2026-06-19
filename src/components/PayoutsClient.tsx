"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { BankSelect } from "@/components/BankSelect";

type Payout = {
  id: string;
  amount: number;
  accountNumber: string;
  accountName: string;
  status: "PENDING" | "PROCESSING" | "PAID" | "FAILED";
  failureReason?: string | null;
  createdAt: string;
};

type Bank = { name: string; code: string };

export function PayoutsClient({
  availableNgn,
  payouts,
}: {
  availableNgn: number;
  payouts: Payout[];
}) {
  const { success, error } = useToast();
  const [list, setList] = useState<Payout[]>(payouts);
  const [available, setAvailable] = useState(availableNgn);
  const [open, setOpen] = useState(false);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [resolveError, setResolveError] = useState("");
  const [amount, setAmount] = useState("");
  const [resolving, setResolving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function openModal() {
    setOpen(true);
    setBankCode("");
    setAccountNumber("");
    setAccountName("");
    setAmount("");
    if (banks.length === 0) {
      try {
        const res = await fetch("/api/merchant/banks");
        const data = await res.json();
        if (res.ok) setBanks(data.banks);
      } catch {
        error("Could not load banks");
      }
    }
  }

  async function resolve(code: string, num: string) {
    setAccountName("");
    setResolveError("");
    if (!code || num.length !== 10) return;
    setResolving(true);
    try {
      const res = await fetch("/api/merchant/resolve-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankCode: code, accountNumber: num }),
      });
      const data = await res.json();
      if (!res.ok || !data.accountName) {
        throw new Error(data.message ?? data.error ?? "Account not found");
      }
      setAccountName(data.accountName);
    } catch (e) {
      setResolveError((e as Error).message);
    } finally {
      setResolving(false);
    }
  }

  async function submit() {
    const amt = Number(amount);
    if (!amt || amt <= 0) return error("Enter a valid amount");
    if (amt > available) return error("Amount exceeds available balance");
    if (!accountName) return error("Resolve the account first");
    setSubmitting(true);
    try {
      const res = await fetch("/api/merchant/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, bankCode, accountNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Payout failed");
      setList((prev) => [
        {
          id: data.id,
          amount: amt,
          accountNumber,
          accountName,
          status: data.status,
          failureReason: data.failureReason,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      if (data.status !== "FAILED") setAvailable((a) => a - amt);
      setOpen(false);
      success(
        data.status === "PAID"
          ? "Payout sent"
          : data.status === "PROCESSING"
            ? "Payout processing"
            : "Payout failed",
      );
    } catch (e) {
      error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const fmt = (n: number) =>
    `₦${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  return (
    <>
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">Available balance</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight">
            {fmt(available)}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={openModal}
          disabled={available <= 0}
        >
          Withdraw
        </button>
      </div>

      <div className="card p-0">
        {list.length === 0 ? (
          <p className="p-5 text-sm font-medium text-ink-400">No payouts yet.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {list.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold">{fmt(p.amount)}</p>
                  <p className="truncate text-xs font-medium text-ink-400">
                    {p.accountName} · {p.accountNumber}
                    {p.failureReason && ` · ${p.failureReason}`}
                  </p>
                </div>
                <span className="badge shrink-0">{p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Withdraw to bank"
        description={`Available: ${fmt(available)}`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={submit}
              disabled={submitting || !accountName}
            >
              {submitting ? "Sending…" : "Withdraw"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Bank</label>
            <BankSelect
              banks={banks}
              value={bankCode}
              onChange={(code) => {
                setBankCode(code);
                resolve(code, accountNumber);
              }}
            />
          </div>
          <div>
            <label className="label" htmlFor="acct">
              Account number
            </label>
            <input
              id="acct"
              className="input"
              inputMode="numeric"
              maxLength={10}
              placeholder="0123456789"
              value={accountNumber}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 10);
                setAccountNumber(v);
                resolve(bankCode, v);
              }}
            />
            {resolving && (
              <p className="mt-1 text-xs font-semibold text-ink-400">
                Verifying account…
              </p>
            )}
            {accountName && !resolving && (
              <p className="mt-1 text-sm font-bold text-ink-900">
                ✓ {accountName}
              </p>
            )}
            {resolveError && !resolving && (
              <p className="mt-1 text-xs font-bold text-ink-500">
                {resolveError}
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="amt">
              Amount (NGN)
            </label>
            <input
              id="amt"
              className="input"
              inputMode="decimal"
              placeholder="10000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
