"use client";

import { useState } from "react";
import Link from "next/link";
import { gettingStarted } from "@/lib/gettingStarted";
import type { BusinessProfile } from "@/lib/storage";

const HIDDEN = "getting-started-hidden";

// A list that ticks itself off, shown only while something is missing and
// put away for good by anyone who would rather get on with it. Nothing here
// blocks anything: the app works without it, it just works worse.
export default function GettingStarted({ profile, customers, documents }: {
  profile: Pick<BusinessProfile, "businessName" | "address" | "bankDetails" | "invoiceNextNumber">;
  customers: number;
  documents: number;
}) {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(HIDDEN) === "1"; } catch { return false; }
  });
  const { steps, done, total, complete } = gettingStarted(profile, { customers, documents });
  if (hidden || complete) return null;

  return (
    <section aria-labelledby="getting-started" className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="getting-started" className="font-semibold">Setting up</h2>
          <p className="mt-1 text-sm text-neutral-600">
            {done} of {total} done. Everything works without these &mdash; they just make your invoices right.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setHidden(true); try { localStorage.setItem(HIDDEN, "1"); } catch {} }}
          className="inline-block py-1 text-sm font-medium text-neutral-700 underline"
        >
          Put this away
        </button>
      </div>

      <div
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`Setting up: ${done} of ${total} done`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100"
      >
        <div className="h-full rounded-full bg-neutral-900" style={{ width: `${Math.round((done / total) * 100)}%` }} />
      </div>

      <ul className="space-y-1">
        {steps.map((s) => (
          <li key={s.id}>
            {s.done ? (
              <p className="flex items-start gap-2 px-1 py-2 text-sm text-neutral-500">
                <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 8.5l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="line-through">{s.label}</span>
              </p>
            ) : (
              <Link href={s.href} className="flex items-start gap-2 rounded-lg px-1 py-2 hover:bg-neutral-50">
                <span aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border border-neutral-400" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium wrap-anywhere">{s.label}</span>
                  <span className="block text-xs text-neutral-500 wrap-anywhere">{s.why}</span>
                </span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
