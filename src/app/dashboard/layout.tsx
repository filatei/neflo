import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/signin");

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <div className="min-h-dvh md:flex">
      <Sidebar email={session.user?.email} signOutAction={doSignOut} />
      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-4xl px-5 py-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
