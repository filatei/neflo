"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

type Key = {
  id: string;
  label: string;
  prefix: string;
  mode: "TEST" | "LIVE";
  createdAt: string;
};

export function DevelopersClient({ initialKeys }: { initialKeys: Key[] }) {
  const { success, error } = useToast();
  const [keys, setKeys] = useState<Key[]>(initialKeys);
  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [mode, setMode] = useState<"TEST" | "LIVE">("TEST");
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  async function create() {
    if (!label.trim()) {
      error("Give the key a label");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/merchant/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create key");
      setSecret(data.apiKey);
      setKeys((prev) => [
        {
          id: data.prefix + Date.now(),
          label: label.trim(),
          prefix: data.prefix,
          mode,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setCreateOpen(false);
      setLabel("");
    } catch (e) {
      error((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      success("API key copied");
    } catch {
      error("Couldn't copy — select manually");
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setCreateOpen(true)}>
          Create API key
        </button>
      </div>

      <div className="card p-0">
        {keys.length === 0 ? (
          <p className="p-5 text-sm font-medium text-ink-400">
            No API keys yet.
          </p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex items-center justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold">{k.label}</p>
                  <p className="font-mono text-xs text-ink-400">
                    {k.prefix}••••••••
                  </p>
                </div>
                <span className="badge">{k.mode}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Create key modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create API key"
        description="Name the key and choose its mode."
        footer={
          <>
            <button
              className="btn-secondary"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </button>
            <button className="btn-primary" onClick={create} disabled={creating}>
              {creating ? "Creating…" : "Create"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="key-label">
              Label
            </label>
            <input
              id="key-label"
              className="input"
              placeholder="Production server"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div>
            <span className="label">Mode</span>
            <div className="flex gap-2">
              {(["TEST", "LIVE"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={
                    "flex-1 rounded-xl border px-4 py-2.5 text-sm font-bold " +
                    (mode === m
                      ? "border-black bg-ink-50"
                      : "border-ink-200 hover:bg-ink-50")
                  }
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Reveal secret once */}
      <Modal
        open={!!secret}
        onClose={() => setSecret(null)}
        title="Your new API key"
        description="Copy it now — you won't be able to see it again."
        footer={
          <>
            <button className="btn-secondary" onClick={() => setSecret(null)}>
              Done
            </button>
            <button className="btn-primary" onClick={copySecret}>
              Copy key
            </button>
          </>
        }
      >
        <pre className="overflow-x-auto rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-3 font-mono text-sm font-semibold">
          {secret}
        </pre>
      </Modal>
    </>
  );
}
