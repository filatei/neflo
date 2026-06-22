"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { useToast } from "@/components/ui/Toast";

/**
 * TapPay — contactless merchant collection.
 *   Collect: the merchant shows a QR; the customer scans to pay.
 *   Pay:     a signed-in customer scans a merchant's QR and pays from balance.
 * Backend: /api/tappay/* (see src/lib/tappay). Live updates over SSE.
 */
type Mode = "collect" | "pay";

const naira = (kobo: number) =>
  "₦" + (kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 });

export function TapPayClient() {
  const [mode, setMode] = useState<Mode>("collect");
  return (
    <div className="space-y-4">
      <div className="grid max-w-sm grid-cols-2 gap-2">
        {(
          [
            ["collect", "Collect"],
            ["pay", "Pay"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={
              "rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 " +
              (mode === m ? "border-black bg-ink-50" : "border-ink-200 hover:bg-ink-50")
            }
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "collect" ? <CollectPanel /> : <PayPanel />}
    </div>
  );
}

// ───────────────────────── Collect (merchant shows QR) ─────────────────────────
type CollectState = "idle" | "waiting" | "scanned" | "paid" | "expired" | "cancelled";

function CollectPanel() {
  const { error } = useToast();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<CollectState>("idle");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [linkBusy, setLinkBusy] = useState(false);
  const [checkout, setCheckout] = useState<{
    full_url: string;
    virtual_account: { accountNumber: string; bankName: string; accountName: string };
  } | null>(null);
  const esRef = useRef<EventSource | null>(null);

  async function getCheckoutLink() {
    if (!sessionId) return;
    setLinkBusy(true);
    try {
      const res = await fetch(`/api/tappay/session/${sessionId}/checkout`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Could not create link");
      setCheckout({ full_url: window.location.origin + data.checkout_url, virtual_account: data.virtual_account });
    } catch (e) {
      error((e as Error).message);
    } finally {
      setLinkBusy(false);
    }
  }

  const closeStream = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  useEffect(() => () => closeStream(), [closeStream]);

  // Countdown while waiting.
  useEffect(() => {
    if (status !== "waiting" && status !== "scanned") return;
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [status, secondsLeft]);

  useEffect(() => {
    if (secondsLeft === 0 && (status === "waiting" || status === "scanned")) {
      setStatus("expired");
      closeStream();
    }
  }, [secondsLeft, status, closeStream]);

  async function generate() {
    const kobo = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(kobo) || kobo <= 0) {
      error("Enter a valid amount");
      return;
    }
    setCheckout(null);
    setBusy(true);
    try {
      const res = await fetch("/api/tappay/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_kobo: kobo, currency: "NGN", note: note || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Could not create session");

      setQr(await QRCode.toDataURL(data.qr_payload, { margin: 1, width: 240 }));
      setSessionId(data.session_id);
      setStatus("waiting");
      setSecondsLeft(Math.max(0, Math.floor((Date.parse(data.expires_at) - Date.now()) / 1000)));

      // Live updates.
      closeStream();
      const es = new EventSource(data.events_url);
      esRef.current = es;
      es.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data) as { type: string };
          if (d.type === "scanned") setStatus("scanned");
          else if (d.type === "paid") {
            setStatus("paid");
            closeStream();
          } else if (d.type === "cancelled") {
            setStatus("cancelled");
            closeStream();
          } else if (d.type === "expired") {
            setStatus("expired");
            closeStream();
          }
        } catch {
          /* ignore heartbeats / non-JSON */
        }
      };
      es.onerror = () => {
        /* SSE auto-reconnects; status poll is the backstop */
      };
    } catch (e) {
      error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!sessionId) return;
    try {
      await fetch(`/api/tappay/session/${sessionId}`, { method: "DELETE" });
    } catch {
      /* best-effort */
    }
    setStatus("cancelled");
    closeStream();
  }

  function reset() {
    closeStream();
    setCheckout(null);
    setQr(null);
    setSessionId(null);
    setStatus("idle");
    setAmount("");
    setNote("");
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  if (status === "paid") {
    return (
      <Result
        tone="success"
        title="Payment received"
        body="The amount has been credited to your balance."
        onDone={reset}
      />
    );
  }
  if (status === "expired" || status === "cancelled") {
    return (
      <Result
        tone="muted"
        title={status === "expired" ? "QR expired" : "Cancelled"}
        body="No payment was taken. Generate a new code to try again."
        onDone={reset}
        doneLabel="New code"
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="card">
        <p className="label">Amount to collect (₦)</p>
        <input
          className="input mt-2"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={status !== "idle"}
        />
        <p className="label mt-4">Note (optional)</p>
        <input
          className="input mt-2"
          placeholder="e.g. Table 4"
          maxLength={140}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={status !== "idle"}
        />
        {status === "idle" ? (
          <button className="btn-primary mt-4 w-full" onClick={generate} disabled={busy}>
            {busy ? "Generating…" : "Show QR to collect"}
          </button>
        ) : (
          <button className="btn-secondary mt-4 w-full" onClick={cancel}>
            Cancel
          </button>
        )}
      </div>

      <div className="card flex flex-col items-center justify-center text-center">
        {qr ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Payment QR" width={240} height={240} className="rounded-xl border border-ink-100" />
            <p className="mt-3 text-lg font-bold">{naira(Math.round(parseFloat(amount) * 100) || 0)}</p>
            <p className="mt-1 text-sm font-semibold text-ink-500">
              {status === "scanned" ? "Payment on its way…" : "Ask the customer to scan"}
            </p>
            <p className="mt-2 font-mono text-xs font-semibold text-ink-400">
              Expires in {mm}:{ss}
            </p>
            {!checkout ? (
              <button className="btn-ghost mt-3 text-xs" onClick={getCheckoutLink} disabled={linkBusy}>
                {linkBusy ? "Creating…" : "Or get a pay link for a non‑Neflo customer"}
              </button>
            ) : (
              <div className="mt-3 w-full rounded-xl border border-ink-100 p-3 text-left">
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Pay link</p>
                <p className="break-all text-xs font-semibold">{checkout.full_url}</p>
                <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-ink-400">Or bank transfer</p>
                <p className="text-sm font-bold">
                  {checkout.virtual_account.bankName} ·{" "}
                  <span className="font-mono">{checkout.virtual_account.accountNumber}</span>
                </p>
                <p className="text-xs font-medium text-ink-500">{checkout.virtual_account.accountName}</p>
              </div>
            )}
          </>
        ) : (
          <p className="py-16 text-sm font-semibold text-ink-400">
            Enter an amount and show a QR for the customer to scan.
          </p>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Pay (customer scans + pays) ─────────────────────────
type PayStep = "scan" | "confirm" | "pin" | "setpin" | "done" | "failed";
type Details = {
  session_id: string;
  amount_kobo: number;
  currency: string;
  merchant_name: string;
  note: string | null;
};

function PayPanel() {
  const { error, success } = useToast();
  const [step, setStep] = useState<PayStep>("scan");
  const [token, setToken] = useState("");
  const [details, setDetails] = useState<Details | null>(null);
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [failMsg, setFailMsg] = useState("");
  const [passkeySet, setPasskeySet] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const onDecoded = useCallback(
    async (qrText: string) => {
      stopCamera();
      setToken(qrText);
      // The QR is a signed JWT; read (unverified) the session id to fetch details.
      let sid: string | null = null;
      try {
        const body = JSON.parse(atob(qrText.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        sid = body.sid ?? null;
      } catch {
        /* not our token */
      }
      if (!sid) {
        setFailMsg("That QR isn't a TapPay code.");
        setStep("failed");
        return;
      }
      try {
        const res = await fetch(`/api/tappay/session/${sid}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? data.error ?? "Session unavailable");
        setDetails(data);
        setStep("confirm");
        // Learn whether this user has a passkey, to offer it on the pay step.
        fetch("/api/tappay/pin")
          .then((r) => r.json())
          .then((s) => setPasskeySet(Boolean(s.passkey_set)))
          .catch(() => {});
      } catch (e) {
        setFailMsg((e as Error).message);
        setStep("failed");
      }
    },
    [stopCamera],
  );

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const tick = () => {
        if (!streamRef.current || !ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        if (code?.data) {
          void onDecoded(code.data);
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      error("Camera unavailable — allow camera access to scan.");
    }
  }, [error, onDecoded]);

  async function pay() {
    if (!/^\d{4,6}$/.test(pin)) {
      error("Enter your 4–6 digit PIN");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/tappay/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pin }),
      });
      const data = await res.json();
      if (res.ok) {
        setStep("done");
        return;
      }
      if (data.error === "pin_not_set") {
        setStep("setpin");
        return;
      }
      setFailMsg(humanError(data));
      setStep("failed");
    } catch (e) {
      setFailMsg((e as Error).message);
      setStep("failed");
    } finally {
      setBusy(false);
    }
  }

  async function payWithPasskey() {
    setBusy(true);
    try {
      const optRes = await fetch("/api/tappay/webauthn/auth-options");
      if (!optRes.ok) throw new Error("Passkey unavailable on this account");
      const optionsJSON = await optRes.json();
      const assertion = await startAuthentication({ optionsJSON });
      const res = await fetch("/api/tappay/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, assertion }),
      });
      const data = await res.json();
      if (res.ok) {
        setStep("done");
        return;
      }
      setFailMsg(humanError(data));
      setStep("failed");
    } catch (e) {
      setFailMsg((e as Error).message || "Passkey verification failed");
      setStep("failed");
    } finally {
      setBusy(false);
    }
  }

  async function registerPasskey() {
    setBusy(true);
    try {
      const optRes = await fetch("/api/tappay/webauthn/register-options");
      if (!optRes.ok) throw new Error("Could not start passkey setup");
      const optionsJSON = await optRes.json();
      const attestation = await startRegistration({ optionsJSON });
      const res = await fetch("/api/tappay/webauthn/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attestation),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message ?? d.error ?? "Passkey setup failed");
      }
      setPasskeySet(true);
      success("Passkey enabled — use it next time");
    } catch (e) {
      error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function savePinThenPay() {
    if (!/^\d{4,6}$/.test(newPin)) {
      error("PIN must be 4–6 digits");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/tappay/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: newPin }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message ?? d.error ?? "Could not set PIN");
      }
      success("PIN set");
      setPin(newPin);
      setNewPin("");
      setStep("pin");
    } catch (e) {
      error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    stopCamera();
    setToken("");
    setDetails(null);
    setPin("");
    setNewPin("");
    setFailMsg("");
    setStep("scan");
  }

  if (step === "done") {
    return (
      <Result
        tone="success"
        title="Paid"
        body={details ? `${naira(details.amount_kobo)} sent to ${details.merchant_name}.` : "Payment sent."}
        onDone={reset}
        doneLabel="Done"
      />
    );
  }
  if (step === "failed") {
    return <Result tone="error" title="Payment failed" body={failMsg} onDone={reset} doneLabel="Try again" />;
  }

  return (
    <div className="card max-w-md">
      {step === "scan" && (
        <div className="text-center">
          <p className="label">Scan a merchant&apos;s TapPay QR</p>
          <div className="mt-3 overflow-hidden rounded-xl border border-ink-100 bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />
          </div>
          <button className="btn-primary mt-4 w-full" onClick={startCamera}>
            Start camera
          </button>
          <p className="mt-2 text-xs font-medium text-ink-400">
            Point your camera at the QR. You&apos;ll confirm the amount before anything is paid.
          </p>
        </div>
      )}

      {step === "confirm" && details && (
        <div className="text-center">
          <p className="label">Confirm payment</p>
          <p className="mt-3 text-3xl font-bold tracking-tight">{naira(details.amount_kobo)}</p>
          <p className="mt-1 text-sm font-semibold text-ink-500">to {details.merchant_name}</p>
          {details.note && <p className="mt-1 text-xs font-medium text-ink-400">{details.note}</p>}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button className="btn-secondary" onClick={reset}>
              Cancel
            </button>
            <button className="btn-primary" onClick={() => setStep("pin")}>
              Confirm
            </button>
          </div>
        </div>
      )}

      {step === "pin" && (
        <div className="text-center">
          {passkeySet && (
            <button className="btn-primary mb-4 w-full" onClick={payWithPasskey} disabled={busy}>
              {busy ? "Verifying…" : `Pay with Face ID / fingerprint`}
            </button>
          )}
          <p className="label">Enter your PIN to pay {details ? naira(details.amount_kobo) : ""}</p>
          <input
            className="input mt-3 text-center tracking-[0.5em]"
            type="password"
            inputMode="numeric"
            maxLength={6}
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            autoFocus
          />
          <button
            className={(passkeySet ? "btn-secondary" : "btn-primary") + " mt-4 w-full"}
            onClick={pay}
            disabled={busy}
          >
            {busy ? "Paying…" : "Pay with PIN"}
          </button>
          {!passkeySet && (
            <button className="btn-ghost mt-3 text-xs" onClick={registerPasskey} disabled={busy}>
              Set up a passkey (fingerprint / Face ID) for faster pay
            </button>
          )}
        </div>
      )}

      {step === "setpin" && (
        <div className="text-center">
          <p className="label">Set a TapPay PIN</p>
          <p className="mt-1 text-xs font-medium text-ink-400">
            You&apos;ll use this 4–6 digit PIN to authorise payments.
          </p>
          <input
            className="input mt-3 text-center tracking-[0.5em]"
            type="password"
            inputMode="numeric"
            maxLength={6}
            placeholder="••••"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
            autoFocus
          />
          <button className="btn-primary mt-4 w-full" onClick={savePinThenPay} disabled={busy}>
            {busy ? "Saving…" : "Set PIN & continue"}
          </button>
        </div>
      )}
    </div>
  );
}

function humanError(data: { error?: string; message?: string }): string {
  switch (data.error) {
    case "insufficient_balance":
      return "You don't have enough balance for this payment.";
    case "invalid_pin":
      return "Incorrect PIN. Please try again.";
    case "too_many_attempts":
      return "Too many attempts. Start the payment again.";
    case "expired":
      return "This QR has expired. Ask for a new one.";
    case "already_consumed":
    case "already_settled":
      return "This QR was already used.";
    case "cannot_pay_self":
      return "You can't pay your own QR.";
    case "daily_cap_exceeded":
      return data.message ?? "This exceeds your daily TapPay limit.";
    default:
      return data.message ?? "Something went wrong. Please try again.";
  }
}

// ───────────────────────── Shared result card ─────────────────────────
function Result({
  tone,
  title,
  body,
  onDone,
  doneLabel = "Done",
}: {
  tone: "success" | "error" | "muted";
  title: string;
  body: string;
  onDone: () => void;
  doneLabel?: string;
}) {
  const ring =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "error"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-ink-200 bg-ink-50 text-ink-600";
  const mark = tone === "success" ? "✓" : tone === "error" ? "✕" : "•";
  return (
    <div className="card max-w-md text-center">
      <div className={"mx-auto flex h-14 w-14 items-center justify-center rounded-full border text-2xl font-bold " + ring}>
        {mark}
      </div>
      <p className="mt-4 text-lg font-bold">{title}</p>
      <p className="mt-1 text-sm font-medium text-ink-500">{body}</p>
      <button className="btn-primary mt-5 w-full" onClick={onDone}>
        {doneLabel}
      </button>
    </div>
  );
}
