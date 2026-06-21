import { getCurrentMerchant } from "@/lib/merchant";
import { SettingsClient } from "@/components/SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const merchant = await getCurrentMerchant();
  if (!merchant) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Business verification</h1>
        <p className="text-sm font-medium text-ink-500">
          Tell us about your business and where to settle funds. Required before
          accepting payments or withdrawing.
        </p>
      </div>
      <SettingsClient
        status={merchant.status}
        submitted={!!merchant.kybSubmittedAt}
        hasCertificate={!!merchant.certificatePath}
        initial={{
          applicantType:
            (merchant.applicantType as "BUSINESS" | "INDIVIDUAL") ?? "BUSINESS",
          legalName: merchant.legalName ?? merchant.name ?? "",
          registrationType: merchant.registrationType ?? "",
          registrationNumber: merchant.registrationNumber ?? "",
          businessType: merchant.businessType ?? "",
          fullName: merchant.fullName ?? "",
          nin: merchant.nin ?? "",
          phone: merchant.phone ?? "",
          website: merchant.website ?? "",
          address: merchant.address ?? "",
          settlementBankCode: merchant.settlementBankCode ?? "",
          settlementAccountNumber: merchant.settlementAccountNumber ?? "",
          settlementAccountName: merchant.settlementAccountName ?? "",
        }}
      />
    </div>
  );
}
