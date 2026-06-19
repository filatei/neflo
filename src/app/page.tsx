import Link from "next/link";
import { auth } from "@/auth";
import { Logo } from "@/components/Logo";

export default async function HomePage() {
  const session = await auth();

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-16">
      <header className="flex items-center justify-between">
        <Logo size={24} />
        <nav className="flex items-center gap-2">
          {session ? (
            <Link href="/dashboard" className="btn-primary">
              Dashboard
            </Link>
          ) : (
            <Link href="/signin" className="btn-primary">
              Sign in
            </Link>
          )}
        </nav>
      </header>

      <section className="py-16 sm:py-24">
        <p className="badge">Stablecoin-first payments</p>
        <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
          Accept USDT &amp; USDC. Settle in local currency.
        </h1>
        <p className="mt-5 max-w-2xl text-lg font-medium text-ink-500">
          Neflo lets your platform receive stablecoin and local payments, then
          converts to Naira and other local currencies automatically — built to
          stay fast on low-bandwidth networks.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={session ? "/dashboard" : "/signin"} className="btn-primary">
            {session ? "Open dashboard" : "Get started"}
          </Link>
          <a href="#how" className="btn-secondary">
            How it works
          </a>
        </div>
      </section>

      <section id="how" className="grid gap-4 sm:grid-cols-3">
        {[
          {
            t: "Generate an address",
            d: "Get a per-platform USDT/USDC address on TRON, Ethereum or Polygon.",
          },
          {
            t: "Receive on-chain",
            d: "Our monitor detects inbound transfers and confirms them automatically.",
          },
          {
            t: "Settle locally",
            d: "Confirmed deposits are converted at live FX and credited in your local currency.",
          },
        ].map((c, i) => (
          <div key={c.t} className="card">
            <span className="text-sm font-bold text-ink-400">0{i + 1}</span>
            <h3 className="mt-2 text-lg font-bold">{c.t}</h3>
            <p className="mt-1 text-sm font-medium text-ink-500">{c.d}</p>
          </div>
        ))}
      </section>

      <footer className="mt-20 border-t border-ink-100 pt-6 text-sm font-medium text-ink-400">
        Neflo · payments.torama.money
      </footer>
    </main>
  );
}
