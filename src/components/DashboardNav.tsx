"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/deposit", label: "Deposit" },
  { href: "/dashboard/transactions", label: "Transactions" },
  { href: "/dashboard/developers", label: "Developers" },
];

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto">
      {items.map((item) => {
        const active =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-bold transition-colors " +
              (active
                ? "border-black text-black"
                : "border-transparent text-ink-400 hover:text-ink-700")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
