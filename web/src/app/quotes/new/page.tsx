"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import QuoteForm, { QuoteFormValue, defaultValidUntil } from "@/components/quote/QuoteForm";
import { Client, businessProfileStore, clientsStore, nextQuoteNumber, quotesStore } from "@/lib/storage";
import { todayIso } from "@/lib/freeInvoiceDraft";
import { errorText } from "@/lib/errorText";

export default function NewQuotePage() {
  const router = useRouter();
  const [data, setData] = useState<{ clients: Client[]; vatRegistered: boolean; initial: QuoteFormValue } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([clientsStore.all(), quotesStore.all(), businessProfileStore.get()])
      .then(([clients, quotes, biz]) => {
        const date = todayIso();
        setData({
          clients,
          vatRegistered: biz.vatRegistered,
          initial: { clientId: "", number: nextQuoteNumber(quotes), date, validUntil: defaultValidUntil(date), items: [], notes: "" },
        });
      })
      .catch((err) => setError(errorText(err, "Could not load your clients.")));
  }, []);

  async function save(v: QuoteFormValue) {
    const quote = await quotesStore.add({ ...v, validUntil: v.validUntil || null });
    router.push(`/quotes/${quote.id}`);
  }

  const hasClients = data?.clients.some((c) => c.kind === "client" && !c.archived);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/quotes" className="text-sm text-neutral-500">← Quotes</Link>
        <h1 className="mt-1 text-2xl font-bold">New quote</h1>
        <p className="mt-1 text-neutral-600">What the job will cost. It stays a draft until you send it.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data ? (
        !error && <p className="text-sm text-neutral-500">Loading…</p>
      ) : !hasClients ? (
        <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <p className="text-sm text-neutral-700">A quote is for a client. Add the client first, then come back here.</p>
          <Link href="/clients/new" className="mt-3 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
            Add a client
          </Link>
        </div>
      ) : (
        <QuoteForm initial={data.initial} clients={data.clients} vatRegistered={data.vatRegistered} saveLabel="Save quote" onSave={save} onCancel={() => router.push("/quotes")} />
      )}
    </div>
  );
}
