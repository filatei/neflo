"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { BankSelect } from "@/components/BankSelect";

type Bank = { name: string; code: string };

type Profile = {
  legalName: string;
  registrationNumber: string;
  businessType: string;
  phone: string;
  website: string;
  address: string;
  settlementBankCode: string;
  settlementAccountNumber: string;
  settlementAccountName: string;
};

export function SettingsClient({
  status,
  submitted,
  initial,
}: {
  status: string;
  submitted: boolean;
  initial: Profile;
}) {
  const { success, error } = useToast();
  const [p, setP] = useState<Profile>(initial);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");

  useEffect(() => {
    fetch("/api/merchant/banks")
      .then((r) => r.json())
      .then((d) => setBanks(d.banks ?? []))
      .catch(() => {});
  }, []);

  const set = (k: keyof Profile, v: string) => setP((s) => ({ ...s, [k]: v }));

  async function resolve(code: string, num: string) {
    set("settlementAccountName", "");
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
      set("settlementAccountName", data.accountName);
    } catch (e) {
      setResolveError((e as Error).message);
    } finally {
      setResolving(false);
    }
  }

  async function submit() {
    if (!p.legalName.trim()) return error("Enter your legal business name");
    setSaving(true);
    try {
      const res = await fetch("/api/merchant/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Save failed");
      success("Submitted for verification");
    } catch (e) {
      error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-4">
        <h2 className="text-lg font-bold">Business details</h2>
        <Field label="Legal business name" value={p.legalName} onChange={(v) => set("legalName", v)} placeholder="Torama Global Services Ltd" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Registration number (RC)" value={p.registrationNumber} onChange={(v) => set("registrationNumber", v)} />
          <Field label="Business type" value={p.businessType} onChange={(v) => set("businessType", v)} placeholder="LLC, Sole proprietor…" />
          <Field label="Phone" value={p.phone} onChange={(v) => set("phone", v)} />
          <Field label="Website" value={p.website} onChange={(v) => set("website", v)} placeholder="https://" />
        </div>
        <Field label="Address" value={p.address} onChange={(v) => set("address", v)} />
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-bold">Settlement bank account</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Bank</label>
            <BankSelect
              banks={banks}
              value={p.settlementBankCode}
              onChange={(code) => {
                set("settlementBankCode", code);
                resolve(code, p.settlementAccountNumber);
              }}
            />
          </div>
          <div>
            <label className="label">Account number</label>
            <input
              className="input"
              inputMode="numeric"
              maxLength={10}
              value={p.settlementAccountNumber}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 10);
                set("settlementAccountNumber", v);
                resolve(p.settlementBankCode, v);
              }}
            />
          </div>
        </div>
        {resolving && (
          <p className="text-xs font-semibold text-ink-400">Verifying account…</p>
        )}
        {p.settlementAccountName && !resolving && (
          <p className="text-sm font-bold text-ink-900">
            ✓ {p.settlementAccountName}
          </p>
        )}
        {resolveError && !resolving && (
          <p className="text-xs font-bold text-ink-500">{resolveError}</p>
        )}
      </section>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink-500">
          {status === "ACTIVE"
            ? "Your business is verified."
            : submitted
              ? "Submitted — under review."
              : "Not yet submitted."}
        </p>
        <button className="btn-primary" onClick={submit} disabled={saving}>
          {saving ? "Saving…" : submitted ? "Update & resubmit" : "Submit for verification"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
