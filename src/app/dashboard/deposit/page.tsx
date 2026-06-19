import { DepositClient } from "@/components/DepositClient";

export default function DepositPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Receive a deposit</h1>
        <p className="text-sm font-medium text-ink-500">
          Receive <span className="font-bold text-ink-700">stablecoins</span> to
          an on-chain address or <span className="font-bold text-ink-700">Naira
          </span> to a bank account. Both credit your balance automatically.
        </p>
      </div>
      <DepositClient />
    </div>
  );
}
