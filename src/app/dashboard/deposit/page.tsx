import { DepositClient } from "@/components/DepositClient";

export default function DepositPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Receive a deposit</h1>
        <p className="text-sm font-medium text-ink-500">
          Generate a stablecoin address. Funds are confirmed on-chain and
          credited to your balance in {""}
          <span className="font-bold text-ink-700">local currency</span>.
        </p>
      </div>
      <DepositClient />
    </div>
  );
}
