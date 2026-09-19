"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BusinessProfile, Client, Quote, businessProfileStore, clientsStore, quotesStore } from "@/lib/storage";
import { quoteTotal } from "@/components/quote/QuoteDocument";
import { quoteStatusBadgeClass, quoteStatusLabel } from "@/lib/quoteStatus";
import { todayIso } from "@/lib/freeInvoiceDraft";
import Tip from "@/components/Tip";
import { errorText } from "@/lib/errorText";

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const today = todayIso();

  useEffect(() => {
    Promise.all([quotesStore.all(), clientsStore.all(), businessProfileStore.get()])
      .then(([q, c, biz]) => {
        setQuotes(q);
        setClients(c);
        setProfile(biz);
      })
      .catch((err) => setError(errorText(err, "Could not load quotes.")))
      .finally(() => setLoading(false));
  }, []);

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || "No client";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Quotes</h1>
          <p className="mt-1 text-neutral-600">Price a job before you start. Once it&apos;s accepted, turn it into an invoice in one tap.</p>
        </div>
        <Link href="/quotes/new" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          New quote
        </Link>
      </div>

      <Tip id="quotes-intro">
        Tip: send the quote from its page. When the customer says yes, tap <strong>Accepted</strong>, then{" "}
        <strong>Turn into invoice</strong>: the lines are copied, nothing to type twice.
      </Tip>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-3">
          {quotes.length === 0 && !error && <p className="text-sm text-neutral-500">No quotes yet.</p>}
          {quotes.map((q) => (
            <Link key={q.id} href={`/quotes/${q.id}`} className="flex items-center justify-between gap-3 rounded-xl border bg-white p-4 text-neutral-900 shadow-sm">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {q.number} · {clientName(q.clientId)}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${quoteStatusBadgeClass(q, today)}`}>{quoteStatusLabel(q, today)}</span>
                </div>
                <div className="text-sm text-neutral-500">
                  {q.date} · £{quoteTotal(q, profile?.vatRegistered ?? false).toFixed(2)}
                  {q.validUntil && q.status !== "invoiced" && ` · valid until ${q.validUntil}`}
                </div>
              </div>
              <span className="shrink-0 text-sm font-medium text-blue-600">Open</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
