"use client";

import { useState } from "react";
import { Modal, ConfirmModal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

type Hook = {
  id: string;
  url: string;
  secret: string;
  active: boolean;
  createdAt: string;
};

type Delivery = {
  id: string;
  event: string;
  status: "PENDING" | "SUCCESS" | "FAILED";
  attempts: number;
  responseStatus: number | null;
  lastError: string | null;
  nextRetryAt: string | null;
  createdAt: string;
};

export function WebhooksClient({ initial }: { initial: Hook[] }) {
  const { success, error } = useToast();
  const [list, setList] = useState<Hook[]>(initial);
  const [addOpen, setAddOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  async function openLog(id: string) {
    setLogOpen(true);
    setLogLoading(true);
    setDeliveries([]);
    try {
      const res = await fetch(`/api/merchant/webhooks/${id}/deliveries`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load log");
      setDeliveries(data.deliveries);
    } catch (e) {
      error((e as Error).message);
    } finally {
      setLogLoading(false);
    }
  }

  async function add() {
    if (!url.trim()) {
      error("Enter a URL");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/merchant/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add endpoint");
      setList((prev) => [data, ...prev]);
      setAddOpen(false);
      setUrl("");
      success("Endpoint added");
    } catch (e) {
      error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(h: Hook) {
    try {
      const res = await fetch(`/api/merchant/webhooks/${h.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !h.active }),
      });
      if (!res.ok) throw new Error("Update failed");
      setList((prev) =>
        prev.map((x) => (x.id === h.id ? { ...x, active: !x.active } : x)),
      );
    } catch (e) {
      error((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/merchant/webhooks/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      setList((prev) => prev.filter((x) => x.id !== id));
      success("Endpoint removed");
    } catch (e) {
      error((e as Error).message);
    } finally {
      setRemoveId(null);
    }
  }

  async function copySecret(secret: string) {
    try {
      await navigator.clipboard.writeText(secret);
      success("Signing secret copied");
    } catch {
      error("Couldn't copy");
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Webhooks</h2>
          <p className="text-sm font-medium text-ink-500">
            Receive signed events (e.g. <code className="font-mono">charge.paid</code>).
            Verify with the <code className="font-mono">X-Neflo-Signature</code> header.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setAddOpen(true)}>
          Add endpoint
        </button>
      </div>

      <div className="card p-0">
        {list.length === 0 ? (
          <p className="p-5 text-sm font-medium text-ink-400">
            No webhook endpoints yet.
          </p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {list.map((h) => (
              <li key={h.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-bold">{h.url}</p>
                  <span className="badge shrink-0">
                    {h.active ? "Active" : "Paused"}
                  </span>
                </div>
                <p className="mt-1 truncate font-mono text-xs text-ink-400">
                  {h.secret.slice(0, 12)}••••••••
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="btn-secondary text-xs"
                    onClick={() => copySecret(h.secret)}
                  >
                    Copy signing secret
                  </button>
                  <button
                    className="btn-secondary text-xs"
                    onClick={() => toggle(h)}
                  >
                    {h.active ? "Pause" : "Resume"}
                  </button>
                  <button
                    className="btn-secondary text-xs"
                    onClick={() => openLog(h.id)}
                  >
                    View log
                  </button>
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => setRemoveId(h.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add webhook endpoint"
        description="We'll POST signed events to this URL."
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={add} disabled={saving}>
              {saving ? "Adding…" : "Add"}
            </button>
          </>
        }
      >
        <div>
          <label className="label" htmlFor="hook-url">
            Endpoint URL
          </label>
          <input
            id="hook-url"
            className="input"
            placeholder="https://api.yourplatform.com/neflo/webhook"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
      </Modal>

      <ConfirmModal
        open={!!removeId}
        title="Remove endpoint?"
        description="Events will no longer be delivered here."
        confirmLabel="Remove"
        onCancel={() => setRemoveId(null)}
        onConfirm={() => removeId && remove(removeId)}
      />

      <Modal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        title="Delivery log"
        description="Most recent attempts. Failures auto-retry with backoff."
        footer={
          <button className="btn-secondary" onClick={() => setLogOpen(false)}>
            Close
          </button>
        }
      >
        {logLoading ? (
          <p className="py-6 text-center text-sm font-semibold text-ink-400">
            Loading…
          </p>
        ) : deliveries.length === 0 ? (
          <p className="py-6 text-center text-sm font-medium text-ink-400">
            No deliveries yet.
          </p>
        ) : (
          <ul className="max-h-80 divide-y divide-ink-100 overflow-y-auto">
            {deliveries.map((d) => (
              <li key={d.id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold">{d.event}</span>
                  <span className="badge">{d.status}</span>
                </div>
                <p className="mt-1 text-xs font-medium text-ink-400">
                  attempt {d.attempts}
                  {d.responseStatus != null && ` · HTTP ${d.responseStatus}`}
                  {d.lastError && ` · ${d.lastError}`}
                </p>
                <p className="text-[11px] font-medium text-ink-400">
                  {new Date(d.createdAt).toLocaleString()}
                  {d.status === "PENDING" &&
                    d.nextRetryAt &&
                    ` · retry ${new Date(d.nextRetryAt).toLocaleTimeString()}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </section>
  );
}
