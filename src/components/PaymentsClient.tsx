"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

type Charge = {
  id: string;
  amountUsd: number;
  paidUsd: number;
  description?: string | null;
  status: "PENDING" | "UNDERPAID" | "PAID" | "EXPIRED";
  createdAt: string;
};

export function PaymentsClient({ charges }: { charges: Charge[] }) {
  const { success, error } = useToast();
  const [list, setList] = useState<Charge[]>(charges);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  function urlFor(id: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/pay/${id}`;
  }

  async function create() {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      error("Enter a valid amount");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/merchant/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountUsd: amt,
          description: description.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create link");
      const charge: Charge = {
        id: data.id,
        amountUsd: amt,
        paidUsd: 0,
        description: description.trim() || null,
        status: "PENDING",
        createdAt: new Date().toISOString(),
      };
      setList((prev) => [charge, ...prev]);
      setCreated(data.id);
      setOpen(false);
      setAmount("");
      setDescription("");
    } catch (e) {
      error((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function copyLink(id: string) {
    try {
      await navigator.clipboard.writeText(urlFor(id));
      success("Checkout link copied");
    } catch {
      error("Couldn't copy link");
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setOpen(true)}>
          Create payment link
        </button>
      </div>

      <div className="card p-0">
        {list.length === 0 ? (
          <p className="p-5 text-sm font-medium text-ink-400">
            No payment links yet.
          </p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {list.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold">
                    ${c.amountUsd.toFixed(2)}
                    {c.description && (
                      <span className="ml-2 font-medium text-ink-400">
                        {c.description}
                      </span>
                    )}
                  </p>
                  <p className="truncate font-mono text-xs text-ink-400">
                    /pay/{c.id}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge">{c.status}</span>
                  <button
                    className="btn-secondary text-xs"
                    onClick={() => copyLink(c.id)}
                  >
                    Copy link
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Create modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create payment link"
        description="Set an amount in USD. Customers pay the equivalent in USDT/USDC."
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={create} disabled={creating}>
              {creating ? "Creating…" : "Create link"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="amount">
              Amount (USD)
            </label>
            <input
              id="amount"
              className="input"
              inputMode="decimal"
              placeholder="50.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="desc">
              Description (optional)
            </label>
            <input
              id="desc"
              className="input"
              placeholder="Order #1234"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      {/* Reveal link modal */}
      <Modal
        open={!!created}
        onClose={() => setCreated(null)}
        title="Payment link ready"
        description="Share this link with your customer."
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCreated(null)}>
              Done
            </button>
            <button
              className="btn-primary"
              onClick={() => created && copyLink(created)}
            >
              Copy link
            </button>
          </>
        }
      >
        <pre className="overflow-x-auto rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-3 font-mono text-xs font-semibold">
          {created ? urlFor(created) : ""}
        </pre>
      </Modal>
    </>
  );
}
