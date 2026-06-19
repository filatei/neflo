import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function CheckEmailPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <div className="card text-center">
        <div className="flex justify-center">
          <Logo size={24} />
        </div>
        <div className="mx-auto mt-6 flex h-12 w-12 items-center justify-center rounded-full border-2 border-black text-xl font-bold">
          ✓
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Check your email</h1>
        <p className="mt-1 text-sm font-medium text-ink-500">
          We sent you a one-time sign-in link. Open it on this device to continue.
          It expires shortly.
        </p>
        <Link href="/signin" className="btn-ghost mt-6">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
