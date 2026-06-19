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
          Continue with Google or get a one-time link by email.
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

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-ink-100" />
          <span className="text-xs font-bold uppercase tracking-wide text-ink-400">
            or
          </span>
          <span className="h-px flex-1 bg-ink-100" />
        </div>

        <form
          className="space-y-3"
          action={async (formData: FormData) => {
            "use server";
            const email = String(formData.get("email") ?? "").trim();
            await signIn("nodemailer", { email, redirectTo: "/dashboard" });
          }}
        >
          <div>
            <label className="label" htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              className="input"
            />
          </div>
          <button type="submit" className="btn-secondary w-full">
            Email me a sign-in link
          </button>
        </form>

        <p className="mt-4 text-xs font-medium text-ink-400">
          By continuing you agree to Neflo&apos;s terms.
        </p>
      </div>
    </main>
  );
}
