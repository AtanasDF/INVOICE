"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/money";
import { paymentsStore } from "@/lib/storage";
import { haptic } from "@/lib/haptics";

type Paid = { amount: number; from?: string | null; number?: string | null };
const EVENT = "invoicer:paid";
const SHOW_MS = 2600;
const PIECES = Array.from({ length: 28 }, (_, i) => i);
const COLOURS = ["#171717", "#525252", "#a3a3a3", "#d4d4d4", "#16a34a"];

// Getting paid is the best moment in a sole trader's week, so marking an
// invoice paid shows it for a moment, from whichever page it was done on.
export function celebratePaid(paid: Paid) {
  window.dispatchEvent(new CustomEvent<Paid>(EVENT, { detail: paid }));
}



export default function PaidCelebration() {
  const [paid, setPaid] = useState<(Paid & { key: number }) | null>(null);
  const [month, setMonth] = useState<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => {
      const key = Date.now();
      setPaid({ ...(e as CustomEvent<Paid>).detail, key });
      setMonth(null);
      haptic();
      const thisMonth = new Date().toISOString().slice(0, 7);
      paymentsStore
        .all()
        .then((ps) => setMonth(ps.filter((p) => p.date.slice(0, 7) === thisMonth).reduce((s, p) => s + p.amount, 0)))
        .catch(() => {});
      clearTimeout(timer);
      timer = setTimeout(() => setPaid((p) => (p?.key === key ? null : p)), SHOW_MS);
    };
    window.addEventListener(EVENT, on);
    return () => {
      window.removeEventListener(EVENT, on);
      clearTimeout(timer);
    };
  }, []);

  if (!paid) return null;
  return (
    // Taps go through to the page, so marking the next invoice paid isn't
    // swallowed; only a tap on the card itself closes it early.
    <div role="status" className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-white/40 print:hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden">
        {PIECES.map((i) => (
          <span
            key={`${paid.key}-${i}`}
            className="confetti"
            style={
              {
                left: `${(i * 37) % 100}%`,
                background: COLOURS[i % COLOURS.length],
                animationDelay: `${(i % 7) * 60}ms`,
                animationDuration: `${1400 + ((i * 53) % 700)}ms`,
                "--drift": `${((i * 29) % 120) - 60}px`,
                "--spin": `${(i % 2 ? 1 : -1) * (360 + ((i * 47) % 360))}deg`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div onClick={() => setPaid(null)} className="paid-pop pointer-events-auto relative mx-6 w-full max-w-xs rounded-2xl border bg-white p-6 text-center text-neutral-900 shadow-xl">
        <svg aria-hidden viewBox="0 0 52 52" className="mx-auto h-16 w-16">
          <circle cx="26" cy="26" r="24" fill="#dcfce7" />
          <path className="paid-tick" d="M15 27l7 7 15-16" fill="none" stroke="#15803d" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="mt-3 text-2xl font-bold">Paid</p>
        <p className="mt-1 text-sm text-neutral-600">
          {paid.amount > 0 ? money(paid.amount) : "Marked as paid"}
          {paid.from ? `${paid.amount > 0 ? " from" : ":"} ${paid.from}` : ""}
        </p>
        {paid.number && <p className="text-xs text-neutral-500">Invoice {paid.number}</p>}
        {month !== null && month > 0 && <p className="mt-3 text-xs font-medium text-neutral-700">{money(month)} in this month</p>}
      </div>
    </div>
  );
}
