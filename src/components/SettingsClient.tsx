"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { BankSelect } from "@/components/BankSelect";

type Bank = { name: string; code: string };

type Profile = {
  applicantType: "BUSINESS" | "INDIVIDUAL";
  legalName: string;
  registrationType: string; // "" | "RC" | "BN"
  registrationNumber: string;
  businessType: string;
  fullName: string;
  nin: string;
  phone: string;
  website: string;
  address: string;
  settlementBankCode: string;
  settlementAccountNumber: string;
  settlementAccountName: string;
};

const BUSINESS_TYPES = [
  "Sole Proprietorship",
  "Registered Business Name (BN)",
  "Limited Company (RC / LTD)",
  "Partnership",
  "NGO / Non-profit",
  "Other",
];

export function SettingsClient({
  status,
  submitted,
  hasCertificate,
  initial,
}: {
  status: string;
  submitted: boolean;
  hasCertificate: boolean;
  initial: Profile;
}) {
  const { success, error } = useToast();
  const [p, setP] = useState<Profile>(initial);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certUploaded, setCertUploaded] = useState(hasCertificate);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/merchant/banks")
      .then((r) => r.json())
      .then((d) => setBanks(d.banks ?? []))
      .catch(() => {});
  }, []);

  const set = (k: keyof Profile, v: string) => setP((s) => ({ ...s, [k]: v }));
  const individual = p.applicantType === "INDIVIDUAL";

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
        throw new Error(data.error ?? data.message ?? "We couldn't verify that account.");
      }
      set("settlementAccountName", data.accountName);
    } catch (e) {
      setResolveError((e as Error).message);
    } finally {
      setResolving(false);
    }
  }

  async function submit() {
    if (individual) {
      if (!p.fullName.trim()) return error("Enter your full name");
      if (!/^\d{11}$/.test(p.nin)) return error("Enter your 11-digit NIN");
    } else if (!p.legalName.trim()) {
      return error("Enter your legal business name");
    }
    const enteringBank = !!(p.settlementBankCode || p.settlementAccountNumber);
    if (enteringBank && !p.settlementAccountName) {
      return error("Verify the settlement account first");
    }
    setSaving(true);
    try {
      // Upload the certificate first (business, optional) so a failure here
      // doesn't leave a half-saved profile.
      if (!individual && certFile) {
        const fd = new FormData();
        fd.append("certificate", certFile);
        const up = await fetch("/api/merchant/certificate", { method: "POST", body: fd });
        const upData = await up.json().catch(() => ({}));
        if (!up.ok) throw new Error(upData.error ?? "Certificate upload failed");
        setCertUploaded(true);
        setCertFile(null);
        if (fileRef.current) fileRef.current.value = "";
      }
      const res = await fetch("/api/merchant/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? data.message ?? "Save failed");
      success("Submitted for verification");
    } catch (e) {
      error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Applicant type */}
      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Who&apos;s registering?</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceCard
            active={!individual}
            title="Registered business"
            hint="A company or business with an RC/BN number."
            onClick={() => set("applicantType", "BUSINESS")}
          />
          <ChoiceCard
            active={individual}
            title="Individual"
            hint="No registered business — use your name and NIN."
            onClick={() => set("applicantType", "INDIVIDUAL")}
          />
        </div>
      </section>

      {/* Details */}
      {individual ? (
        <section className="card space-y-4">
          <h2 className="text-lg font-bold">Your details</h2>
          <Field label="Full name (as on your ID)" value={p.fullName} onChange={(v) => set("fullName", v)} placeholder="Akpodigha Filatei-Ele" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">NIN (National Identification Number)</label>
              <input
                className="input"
                inputMode="numeric"
                maxLength={11}
                placeholder="11 digits"
                value={p.nin}
                onChange={(e) => set("nin", e.target.value.replace(/\D/g, "").slice(0, 11))}
              />
              <p className="mt-1 text-xs font-medium text-ink-400">Your 11-digit NIN — used to verify your identity.</p>
            </div>
            <Field label="Phone" value={p.phone} onChange={(v) => set("phone", v)} />
          </div>
          <Field label="Address" value={p.address} onChange={(v) => set("address", v)} />
        </section>
      ) : (
        <section className="card space-y-4">
          <h2 className="text-lg font-bold">Business details</h2>
          <Field label="Legal business name" value={p.legalName} onChange={(v) => set("legalName", v)} placeholder="Torama Global Services Ltd" />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Business type</label>
              <select className="input" value={p.businessType} onChange={(e) => set("businessType", e.target.value)}>
                <option value="">Select type…</option>
                {BUSINESS_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Registration number</label>
              <div className="flex gap-2">
                <select
                  className="input w-24 shrink-0"
                  value={p.registrationType}
                  onChange={(e) => set("registrationType", e.target.value)}
                  aria-label="Registration type"
                >
                  <option value="">Type</option>
                  <option value="RC">RC</option>
                  <option value="BN">BN</option>
                </select>
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder="Number only"
                  value={p.registrationNumber}
                  onChange={(e) => set("registrationNumber", e.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 40))}
                />
              </div>
              <p className="mt-1 text-xs font-medium text-ink-400">
                Pick <b>RC</b> (company) or <b>BN</b> (business name), then enter the number only — no &quot;RC&quot;/&quot;BN&quot; prefix.
              </p>
            </div>
            <Field label="Phone" value={p.phone} onChange={(v) => set("phone", v)} />
            <Field label="Website" value={p.website} onChange={(v) => set("website", v)} placeholder="https://" />
          </div>
          <Field label="Address" value={p.address} onChange={(v) => set("address", v)} />

          {/* Certificate upload (optional) */}
          <div>
            <label className="label">Business registration certificate <span className="font-medium text-ink-400">(optional)</span></label>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="block w-full text-sm font-medium text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-900 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-ink-700"
              onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
            />
            <p className="mt-1 text-xs font-medium text-ink-400">
              PDF, JPG or PNG, up to 5 MB.{" "}
              {certUploaded && !certFile && (
                <>Uploaded ✓ — <a className="underline" href="/api/merchant/certificate" target="_blank" rel="noreferrer">view current</a>.</>
              )}
              {certFile && <>Selected: <b>{certFile.name}</b> (saved when you submit).</>}
            </p>
          </div>
        </section>
      )}

      {/* Settlement bank account */}
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
        {resolving && <p className="text-xs font-semibold text-ink-400">Verifying account…</p>}
        {p.settlementAccountName && !resolving && (
          <p className="text-sm font-bold text-ink-900">✓ {p.settlementAccountName}</p>
        )}
        {resolveError && !resolving && (
          <div>
            <p className="text-xs font-bold text-ink-500">{resolveError}</p>
            <input
              className="input mt-1"
              placeholder="Account holder name"
              value={p.settlementAccountName}
              onChange={(e) => set("settlementAccountName", e.target.value)}
            />
          </div>
        )}
      </section>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink-500">
          {status === "ACTIVE"
            ? "Your account is verified."
            : submitted
              ? "Submitted — under review."
              : "Not yet submitted."}
        </p>
        <button className="btn-primary" onClick={submit} disabled={saving || resolving}>
          {saving ? "Saving…" : submitted ? "Update & resubmit" : "Submit for verification"}
        </button>
      </div>
    </div>
  );
}

function ChoiceCard({
  active,
  title,
  hint,
  onClick,
}: {
  active: boolean;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition ${
        active ? "border-ink-900 bg-ink-50 ring-1 ring-ink-900" : "border-ink-200 hover:border-ink-400"
      }`}
    >
      <span className="block text-sm font-bold text-ink-900">{title}</span>
      <span className="mt-0.5 block text-xs font-medium text-ink-500">{hint}</span>
    </button>
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
      <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
