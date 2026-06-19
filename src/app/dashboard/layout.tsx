import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Sidebar } from "@/components/Sidebar";
import { KycBanner } from "@/components/KycBanner";
import { getCurrentMerchant } from "@/lib/merchant";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/signin");

  const merchant = await getCurrentMerchant();

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <div className="min-h-dvh md:flex">
      <Sidebar
        email={session.user?.email}
        isAdmin={session.user?.isAdmin}
        signOutAction={doSignOut}
      />
      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-4xl px-5 py-6 sm:py-8">
          {merchant && (
            <KycBanner
              status={merchant.status}
              submitted={!!merchant.kybSubmittedAt}
            />
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
