"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Client } from "@/lib/storage";

// Who you work with, on the dashboard (Atanas, 2026-09-23: "we need easy
// access for companies and suppliers... you should be able to see your
// companies and from each company start straight away a new invoice").
//
// One search across both kinds rather than two lists: nobody thinks "is
// Travis Perkins a customer or a supplier", they think "Travis Perkins".
// The row itself is the action — tapping a name starts the invoice — because
// that is the whole point of the panel.
const ROW = "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left hover:bg-neutral-50";

export default function People({ contacts, invoiceCounts }: { contacts: Client[]; invoiceCounts: Map<string, number> }) {
  const [query, setQuery] = useState("");

  const live = useMemo(() => contacts.filter((c) => !c.archived), [contacts]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Busiest first when nobody has typed: the people you invoice most are
      // the ones you are most likely to invoice again.
      return [...live].sort((a, b) => (invoiceCounts.get(b.id) ?? 0) - (invoiceCounts.get(a.id) ?? 0) || a.name.localeCompare(b.name)).slice(0, 6);
    }
    return live.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 12);
  }, [live, query, invoiceCounts]);

  const searching = query.trim().length > 0;

  return (
    <section aria-labelledby="people-heading" aria-label="Who you work with" className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="people-heading" className="font-semibold">Who you work with</h2>
        <Link href="/clients" className="inline-block py-1 text-sm font-medium text-neutral-700 underline">See all</Link>
      </div>

      <label htmlFor="people-search" className="sr-only">Search customers and suppliers</label>
      <input
        id="people-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search customers and suppliers"
        className="w-full rounded-lg border px-3 py-2.5 text-base"
      />

      <div className="flex flex-wrap gap-2">
        <Link href="/clients/new" className="rounded-lg border px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
          + Add a company
        </Link>
        <Link href="/clients/new?person=1" className="rounded-lg border px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
          + Add a customer
        </Link>
        <Link href="/clients/new?kind=supplier" className="rounded-lg border px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
          + Add a supplier
        </Link>
      </div>

      {live.length === 0 ? (
        <p className="text-sm text-neutral-600">
          Nobody yet. Add a customer to invoice them, or a supplier to file their bills against.
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-neutral-600">Nobody called &ldquo;{query.trim()}&rdquo;.</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((c) => (
            <li key={c.id}>
              <Link href={`/invoices/new?client=${encodeURIComponent(c.id)}`} className={ROW}>
                <span className="min-w-0">
                  {/* truncate and wrap-anywhere contradict each other: truncate won, so a
                      long customer name was cut with an ellipsis and turning the
                      text up made it cut sooner. The house rule is that a long
                      name wraps. */}
                  <span className="block font-medium wrap-anywhere">{c.name}</span>
                  <span className="block text-xs text-neutral-500">
                    {c.kind === "supplier" ? "Supplier" : c.isCompany ? "Company" : "Customer"}
                    {(invoiceCounts.get(c.id) ?? 0) > 0 && ` · ${invoiceCounts.get(c.id)} invoice${invoiceCounts.get(c.id) === 1 ? "" : "s"}`}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium text-neutral-700">New invoice &rarr;</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!searching && live.length > shown.length && (
        <p className="text-xs text-neutral-500">Showing your {shown.length} busiest. Search above for anyone else.</p>
      )}
    </section>
  );
}
