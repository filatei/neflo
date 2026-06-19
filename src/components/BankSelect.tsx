"use client";

import { useEffect, useRef, useState } from "react";

type Bank = { name: string; code: string };

/** Searchable bank dropdown (type to filter). Monochrome. */
export function BankSelect({
  banks,
  value,
  onChange,
  placeholder = "Select bank",
}: {
  banks: Bank[];
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = banks.find((b) => b.code === value);
  const filtered = q
    ? banks.filter((b) => b.name.toLowerCase().includes(q.toLowerCase()))
    : banks;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setQ("");
        }}
        className="input flex w-full items-center justify-between text-left"
      >
        <span className={selected ? "truncate" : "truncate text-ink-400"}>
          {selected ? selected.name : placeholder}
        </span>
        <span className="ml-2 shrink-0 text-ink-400">▾</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-ink-200 bg-white shadow-modal">
          <div className="p-2">
            <input
              autoFocus
              className="input py-2"
              placeholder="Search bank…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <ul className="max-h-60 overflow-y-auto pb-2">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm font-medium text-ink-400">
                No match
              </li>
            ) : (
              filtered.map((b) => (
                <li key={b.code}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(b.code);
                      setOpen(false);
                    }}
                    className={
                      "block w-full px-3 py-2 text-left text-sm hover:bg-ink-50 " +
                      (b.code === value ? "bg-ink-50 font-bold" : "font-medium")
                    }
                  >
                    {b.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
