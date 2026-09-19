"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Client, clientsStore } from "@/lib/storage";
import { ANSWER_BADGES, ANSWER_LABELS, QuoteRequest, RequestSupplier, answerKey, offerOf, quoteRequestsStore, requestSuppliersStore } from "@/lib/quoteRequests";
import { formatPence, supplierTotal } from "@/lib/quoteCompare";
import { shortDate } from "@/components/quoteRequest/dates";
import QuotesTabs from "@/components/quoteRequest/QuotesTabs";
import { errorText } from "@/lib/errorText";

export default function QuoteRequestsPage() {
  const [requests, setRequests] = useState<QuoteRequest[]>([]);
  const [rows, setRows] = useState<RequestSupplier[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([quoteRequestsStore.all(), requestSuppliersStore.all(), clientsStore.all()])
      .then(([r, s, c]) => {
        setRequests(r);
        setRows(s);
        setClients(c);
      })
      .catch((err) => setError(errorText(err, "Could not load your requests.")))
      .finally(() => setLoading(false));
  }, []);

  const nameOf = (id: string) => clients.find((c) => c.id === id)?.name ?? "Supplier";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Quotes</h1>
          <p className="mt-1 text-neutral-600">Ask suppliers to price a list, then compare their prices line by line.</p>
        </div>
        <Link href="/quotes/requests/new" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          New request
        </Link>
      </div>

      <QuotesTabs current="suppliers" />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-3">
          {requests.length === 0 && !error && <p className="text-sm text-neutral-500">No requests yet. Make one to email your suppliers a list to price.</p>}
          {requests.map((r) => {
            const mine = rows.filter((s) => s.requestId === r.id);
            return (
              <Link key={r.id} href={`/quotes/requests/${r.id}`} className="block rounded-xl border bg-white p-4 text-neutral-900 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate font-medium">{r.title}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${r.status === "open" ? "bg-neutral-100 text-neutral-800" : "bg-neutral-200 text-neutral-600"}`}>
                    {r.status === "open" ? "Open" : "Closed"}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-neutral-500">
                  {r.items.length} {r.items.length === 1 ? "item" : "items"} · asked {shortDate(r.createdAt)}
                  {r.neededBy ? ` · needed by ${shortDate(r.neededBy)}` : ""}
                </p>
                {mine.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t pt-3">
                    {mine.map((s) => {
                      const key = answerKey(s);
                      const t = s.status === "replied" ? supplierTotal(offerOf(s, ""), r.items) : null;
                      return (
                        <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate">{nameOf(s.supplierId)}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            {t && (
                              <span className="font-medium">
                                {formatPence(t.ex)}
                                {t.priced < r.items.length && <span className="font-normal text-neutral-500"> ({t.priced}/{r.items.length})</span>}
                              </span>
                            )}
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ANSWER_BADGES[key]}`}>{ANSWER_LABELS[key]}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
