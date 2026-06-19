import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { DashboardNav } from "@/components/DashboardNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/signin");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <Link href="/dashboard" className="text-lg font-extrabold tracking-tight">
            Neflo
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-semibold text-ink-500 sm:inline">
              {session.user?.email}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button className="btn-ghost text-sm">Sign out</button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-5">
          <DashboardNav />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-6 sm:py-8">{children}</main>
    </div>
  );
}
