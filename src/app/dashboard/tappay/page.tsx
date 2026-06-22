import { TapPayClient } from "@/components/TapPayClient";

export default function TapPayPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">TapPay</h1>
        <p className="text-sm font-medium text-ink-500">
          Collect a payment by showing a <span className="font-bold text-ink-700">QR</span> for
          the customer to scan, or <span className="font-bold text-ink-700">pay</span> another
          merchant by scanning theirs. Payments are instant from your Neflo balance.
        </p>
      </div>
      <TapPayClient />
    </div>
  );
}
