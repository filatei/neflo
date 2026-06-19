"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

type Merchant = {
  id: string;
  name: string;
  email: string;
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
  registrationNumber?: string | null;
  settlementAccountName?: string | null;
  submitted: boolean;
};

export function AdminClient({ merchants }: { merchants: Merchant[] }) {
  const { success, error } = useToast();
  const [list, setList] = useState<Merchant[]>(merchants);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(id: string, action: "approve" | "suspend" | "reactivate") {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/merchants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setList((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: data.status } : m)),
      );
      success(`Merchant ${action}d`);
    } catch (e) {
      error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card p-0">
      <ul className="divide-y divide-ink-100">
        {list.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="text-sm font-bold">{m.name}</p>
              <p className="truncate text-xs font-medium text-ink-400">
                {m.email}
                {m.registrationNumber && ` · RC ${m.registrationNumber}`}
                {m.settlementAccountName && ` · ${m.settlementAccountName}`}
                {!m.submitted && " · not submitted"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge">{m.status}</span>
              {m.status !== "ACTIVE" && (
                <button
                  className="btn-primary text-xs"
                  onClick={() => act(m.id, "approve")}
                  disabled={busy === m.id}
                >
                  Approve
                </button>
              )}
              {m.status === "ACTIVE" && (
                <button
                  className="btn-secondary text-xs"
                  onClick={() => act(m.id, "suspend")}
                  disabled={busy === m.id}
                >
                  Suspend
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
