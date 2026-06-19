import Link from "next/link";

/**
 * Shown across the dashboard until a merchant is verified. Monochrome — a
 * bordered notice, no color.
 */
export function KycBanner({
  status,
  submitted,
}: {
  status: string;
  submitted: boolean;
}) {
  if (status === "ACTIVE") return null;

  const title =
    status === "SUSPENDED"
      ? "Account suspended"
      : submitted
        ? "Verification in review"
        : "Verify your business to go live";
  const body =
    status === "SUSPENDED"
      ? "Contact support to restore access."
      : submitted
        ? "We're reviewing your details. You can explore the dashboard, but accepting payments and withdrawals stay disabled until approval."
        : "Complete your business profile to start accepting payments and withdrawing funds.";

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-black bg-white px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-sm font-medium text-ink-500">{body}</p>
      </div>
      {status !== "SUSPENDED" && (
        <Link href="/dashboard/settings" className="btn-primary shrink-0">
          {submitted ? "Review details" : "Verify business"}
        </Link>
      )}
    </div>
  );
}
