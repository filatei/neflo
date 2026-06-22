"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "./Logo";

type Item = { href: string; label: string };
type Section = { label?: string; items: Item[] };

const SECTIONS: Section[] = [
  { items: [{ href: "/dashboard", label: "Overview" }] },
  {
    label: "Accept payments",
    items: [
      { href: "/dashboard/payments", label: "Payment links" },
      { href: "/dashboard/tappay", label: "TapPay" },
      { href: "/dashboard/deposit", label: "Deposit" },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/dashboard/transactions", label: "Transactions" },
      { href: "/dashboard/payouts", label: "Payouts" },
    ],
  },
  {
    label: "Developers",
    items: [{ href: "/dashboard/developers", label: "Developers" }],
  },
  {
    label: "Account",
    items: [
      { href: "/dashboard/team", label: "Team" },
      { href: "/dashboard/settings", label: "Settings" },
    ],
  },
];

export function Sidebar({
  email,
  isAdmin,
  signOutAction,
}: {
  email?: string | null;
  isAdmin?: boolean;
  signOutAction: () => void;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const sections = isAdmin
    ? [
        ...SECTIONS,
        { label: "Admin", items: [{ href: "/dashboard/admin", label: "Merchants" }] },
      ]
    : SECTIONS;

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  const Nav = (
    <div className="flex h-full flex-col bg-ink-900 text-white">
      <div className="flex items-center justify-between px-5 py-5 text-white">
        <Link href="/dashboard" onClick={() => setOpen(false)}>
          {/* White tile on the dark sidebar → dark arrows. */}
          <Logo size={22} glyph="#0d0d0d" />
        </Link>
        <button
          className="rounded-md p-1 text-ink-300 hover:text-white md:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        >
          ×
        </button>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {sections.map((section, i) => (
          <div key={i}>
            {section.label && (
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={
                      "block rounded-lg px-3 py-2 text-sm font-bold transition-colors " +
                      (active
                        ? "bg-white text-black"
                        : "text-ink-300 hover:bg-white/10 hover:text-white")
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        {email && (
          <p className="truncate px-2 pb-2 text-xs font-medium text-ink-400">
            {email}
          </p>
        )}
        <form action={signOutAction}>
          <button className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-ink-300 hover:bg-white/10 hover:text-white">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-100 bg-white px-4 py-3 md:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 flex-col items-center justify-center gap-1 rounded-lg border border-ink-200"
        >
          <span className="h-0.5 w-4 bg-black" />
          <span className="h-0.5 w-4 bg-black" />
          <span className="h-0.5 w-4 bg-black" />
        </button>
        <Link href="/dashboard">
          <Logo size={20} className="text-black" />
        </Link>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 md:sticky md:top-0 md:block md:h-dvh">
        {Nav}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-64 animate-slide-up">
            {Nav}
          </div>
        </div>
      )}
    </>
  );
}
