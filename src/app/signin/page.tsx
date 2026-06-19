import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Logo } from "@/components/Logo";

export default async function SignInPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <div className="card">
        <Logo size={24} />
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm font-medium text-ink-500">
          Continue with your Google account to access your dashboard.
        </p>

        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <button type="submit" className="btn-primary w-full">
            Continue with Google
          </button>
        </form>

        <p className="mt-4 text-xs font-medium text-ink-400">
          By continuing you agree to Neflo&apos;s terms. Access may be limited to
          approved addresses.
        </p>
      </div>
    </main>
  );
}
