"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BusinessProfile, Client, Quote, businessProfileStore, clientsStore, quotesStore } from "@/lib/storage";
import { money, quoteTotal } from "@/components/quote/QuoteDocument";
import { quoteStatusBadgeClass, quoteStatusLabel, shortDate } from "@/lib/quoteStatus";
import { depositGross } from "@/lib/quoteDeposit";
import { todayIso } from "@/lib/freeInvoiceDraft";
import Tip from "@/components/Tip";
import { loadFailed } from "@/lib/errorText";
import TextCustomer from "@/components/TextCustomer";
import QuotesTabs from "@/components/quoteRequest/QuotesTabs";

// Quiet for this long after sending is worth a nudge.
const QUIET_DAYS = 5;

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
      .catch((err) => setError(loadFailed(err, "your quotes")))
      .finally(() => setLoading(false));
  }, []);

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || "No client";
  // A sent quote keeps the VAT setting it went out under (migration-033);
  // a draft, and anything from before the column, follows Settings.
  const vatOf = (q: Quote) => q.vatRegistered ?? profile?.vatRegistered ?? false;
  const days = (iso: string) => Math.floor((Date.parse(today) - Date.parse(iso)) / 86_400_000);
  // Sent, still good, and quiet for long enough to be worth a nudge.
  const quiet = quotes.filter((q) => q.status === "sent" && days(q.date) >= QUIET_DAYS && (!q.validUntil || q.validUntil >= today));

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

      <QuotesTabs current="mine" />

      <Tip id="quotes-intro">
        Tip: send the quote from its page. When the customer says yes, tap <strong>Accepted</strong>, then{" "}
        <strong>Turn into invoice</strong>: the lines are copied, nothing to type twice.
      </Tip>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {quiet.length > 0 && (
        <section className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <div>
            <h2 className="font-semibold">Waiting on an answer</h2>
            <p className="text-sm text-neutral-600">Sent a while ago and still open. A nudge often decides it.</p>
          </div>
          {quiet.map((q) => {
            const client = clients.find((c) => c.id === q.clientId) ?? null;
            const total = money(quoteTotal(q, vatOf(q)));
            return (
              <div key={q.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/quotes/${q.id}`} className="font-medium">
                    {q.number} · {clientName(q.clientId)}
                  </Link>
                  <span className="text-sm text-neutral-600">
                    {total} · sent {days(q.date)} days ago{q.validUntil ? ` · holds until ${shortDate(q.validUntil)}` : ""}
                  </span>
                </div>
                {client ? (
                  <div className="mt-2">
                    <TextCustomer
                      client={client}
                      from={profile?.businessName ?? ""}
                      presets={["quoteChase", "quote"]}
                      quote={{ total, validUntil: q.validUntil ? shortDate(q.validUntil) : "" }}
                    />
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-neutral-600">Pick who it&apos;s for on the quote to message them.</p>
                )}
              </div>
            );
          })}
        </section>
      )}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-3">
          {quotes.length === 0 && !error && <p className="text-sm text-neutral-500">No quotes yet.</p>}
          {quotes.map((q) => {
            const deposit = depositGross(q, vatOf(q));
            const open = q.status === "draft" || q.status === "sent";
            return (
              <Link key={q.id} href={`/quotes/${q.id}`} className="flex items-start justify-between gap-3 rounded-xl border bg-white p-4 text-neutral-900 shadow-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {q.number} · {clientName(q.clientId)}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${quoteStatusBadgeClass(q, today)}`}>{quoteStatusLabel(q, today)}</span>
                    <span>{shortDate(q.date)}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold">{money(quoteTotal(q, vatOf(q)))}</p>
                  {deposit ? <p className="text-xs text-neutral-500">{money(deposit)} deposit</p> : null}
                  {open && q.validUntil && <p className="text-xs text-neutral-500">until {shortDate(q.validUntil)}</p>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
