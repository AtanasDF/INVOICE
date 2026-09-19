"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import QuoteDocument, { quoteTotal } from "@/components/quote/QuoteDocument";
import QuoteForm, { QuoteFormValue } from "@/components/quote/QuoteForm";
import SendInvoicePanel from "@/components/SendInvoicePanel";
import { longDate } from "@/components/invoice/InvoiceDocument";
import { BusinessProfile, Client, Invoice, Quote, QuoteStatus, businessProfileStore, clientsStore, invoicesStore, quotesStore } from "@/lib/storage";
import { addDays, todayIso } from "@/lib/freeInvoiceDraft";
import { draftPlaceholderNumber } from "@/lib/invoiceNumber";
import { quoteStatusBadgeClass, quoteStatusLabel, termsLength } from "@/lib/quoteStatus";
import { errorText } from "@/lib/errorText";

type Open = Exclude<QuoteStatus, "invoiced">;

const SECONDARY = "rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50";
const PRIMARY = "rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

async function fetchQuote(id: string) {
  const [quote, clients, profile] = await Promise.all([quotesStore.get(id), clientsStore.all(), businessProfileStore.get()]);
  let orphan: Invoice | null | undefined;
  if (quote?.status === "invoiced" && !quote.invoiceId) {
    orphan = (await invoicesStore.all()).find((inv) => inv.tags.includes(`from ${quote.number}`)) ?? null;
    if (orphan) await quotesStore.linkInvoice(quote.id, orphan.id).catch(() => {});
  }
  return { quote, clients, profile, orphan };
}

export default function QuotePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  // An invoiced quote whose link wasn't saved: the invoice made from it,
  // found by its "from Q-..." tag, if there is one.
  const [orphan, setOrphan] = useState<Invoice | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => fetchQuote(id).then((d) => {
    setQuote(d.quote);
    setClients(d.clients);
    setProfile(d.profile);
    setOrphan(d.orphan);
  }), [id]);

  useEffect(() => {
    fetchQuote(id)
      .then((d) => {
        setQuote(d.quote);
        setClients(d.clients);
        setProfile(d.profile);
        setOrphan(d.orphan);
      })
      .catch((err) => setError(errorText(err, "Could not load the quote.")))
      .finally(() => setLoading(false));
  }, [id]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorText(err, "Something went wrong."));
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (!quote) {
    return (
      <div className="space-y-2">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-sm text-neutral-600">Quote not found.</p>
        <Link href="/quotes" className="text-sm font-medium text-blue-600">Back to quotes</Link>
      </div>
    );
  }

  const q = quote;
  const client = clients.find((c) => c.id === q.clientId) ?? null;
  const vatRegistered = profile?.vatRegistered ?? false;
  const today = todayIso();
  const total = quoteTotal(q, vatRegistered);
  const invoiceId = q.invoiceId ?? orphan?.id ?? null;

  const setStatus = (status: Open) =>
    run(async () => {
      await quotesStore.setStatus(q.id, status);
      setQuote({ ...q, status });
    });

  async function saveEdit(v: QuoteFormValue) {
    await quotesStore.updateDraft(q.id, { ...v, validUntil: v.validUntil || null });
    setQuote({ ...q, ...v, validUntil: v.validUntil || null });
    setEditing(false);
  }

  // Claim the quote, make the draft invoice, then link it. The claim stops
  // a second tap or tab making a second invoice; if the invoice can't be
  // made the claim is released so the quote can be tried again.
  const toInvoice = () =>
    run(async () => {
      const before = q.status as Open;
      if (!(await quotesStore.claimForInvoice(q.id))) throw new Error("This quote has already been turned into an invoice.");
      let invoice: Invoice;
      try {
        const date = todayIso();
        invoice = await invoicesStore.add({
          clientId: q.clientId,
          date,
          number: draftPlaceholderNumber(),
          items: q.items,
          notes: q.notes,
          dueDate: addDays(date, termsLength(client?.paymentTerms ?? "") ?? 30),
          paymentTerms: client?.paymentTerms ?? "",
          status: "draft",
          tags: [`from ${q.number}`],
        });
      } catch (err) {
        await quotesStore.releaseClaim(q.id, before).catch(() => {});
        throw err;
      }
      await quotesStore.linkInvoice(q.id, invoice.id).catch(() => {});
      router.push(`/invoices/${invoice.id}`);
    });

  if (editing) {
    return (
      <div className="space-y-6">
        <div>
          <button onClick={() => setEditing(false)} className="text-sm text-neutral-500">← Back to the quote</button>
          <h1 className="mt-1 text-2xl font-bold">Edit quote {q.number}</h1>
        </div>
        <QuoteForm
          initial={{ clientId: q.clientId, number: q.number, date: q.date, validUntil: q.validUntil ?? "", items: q.items, notes: q.notes }}
          clients={clients}
          vatRegistered={vatRegistered}
          saveLabel="Save changes"
          onSave={saveEdit}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <Link href="/quotes" className="text-sm text-neutral-500">← Quotes</Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">Quote {q.number}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${quoteStatusBadgeClass(q, today)}`}>{quoteStatusLabel(q, today)}</span>
          </div>
          <p className="mt-1 text-neutral-600">
            {client?.name ?? "No client"} · £{total.toFixed(2)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {q.status === "draft" && (
            <button onClick={() => setEditing(true)} disabled={busy} className={SECONDARY}>Edit</button>
          )}
          <button onClick={() => window.print()} className={SECONDARY}>Print</button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 print:hidden">{error}</p>}

      <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:hidden">
        {q.status === "invoiced" ? (
          invoiceId ? (
            <p className="text-sm text-neutral-700">
              Turned into an invoice.{" "}
              <Link href={`/invoices/${invoiceId}`} className="font-medium text-blue-600">Open the invoice</Link>
            </p>
          ) : (
            <div className="space-y-3 text-sm text-neutral-700">
              <p>This quote was being turned into an invoice, but no invoice from it can be found.</p>
              <button onClick={() => run(async () => { await quotesStore.releaseClaim(q.id, "accepted"); await load(); })} disabled={busy} className={SECONDARY}>
                Put it back to accepted
              </button>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-700">
              {q.status === "draft" && "Not sent yet. Send it below, or mark it sent if you gave it to them another way."}
              {q.status === "sent" && "Waiting on the customer. When they say yes, mark it accepted."}
              {q.status === "accepted" && "Accepted. Turn it into an invoice when you're ready to bill."}
              {q.status === "declined" && "Declined. Reopen it if they change their mind."}
            </p>
            <div className="flex flex-wrap gap-2">
              {(q.status === "accepted" || q.status === "sent" || q.status === "draft") && (
                <button onClick={toInvoice} disabled={busy} className={q.status === "accepted" ? PRIMARY : SECONDARY}>
                  {busy ? "Working…" : "Turn into invoice"}
                </button>
              )}
              {q.status === "draft" && <button onClick={() => setStatus("sent")} disabled={busy} className={SECONDARY}>Mark as sent</button>}
              {(q.status === "draft" || q.status === "sent") && (
                <>
                  <button onClick={() => setStatus("accepted")} disabled={busy} className={q.status === "sent" ? PRIMARY : SECONDARY}>Accepted</button>
                  <button onClick={() => setStatus("declined")} disabled={busy} className={SECONDARY}>Declined</button>
                </>
              )}
              {q.status === "accepted" && <button onClick={() => setStatus("sent")} disabled={busy} className={SECONDARY}>Not accepted after all</button>}
              {q.status === "declined" && <button onClick={() => setStatus("sent")} disabled={busy} className={SECONDARY}>Reopen</button>}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-white p-6 text-neutral-900 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <QuoteDocument quote={q} client={client} profile={profile} />
      </div>

      {(q.status === "draft" || q.status === "sent" || q.status === "accepted") && (
        <SendInvoicePanel
          docType="quote"
          sheet={<QuoteDocument quote={q} client={client} profile={profile} />}
          pdfKey={JSON.stringify([q.number, q.date, q.validUntil, q.items, q.notes, client, profile])}
          resetKey={q.id}
          signInNext={`/quotes/${q.id}`}
          missingName="Add your business name in Settings first, so the customer knows who it's from."
          fields={{
            issuerName: profile?.businessName ?? "",
            issuerEmail: "",
            customerName: client?.name ?? "",
            customerEmail: client?.email ?? "",
            number: q.number,
            total: `£${total.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            dueDate: q.validUntil ? longDate(q.validUntil) : "",
            bank: [],
          }}
          onSent={() => {
            if (q.status === "draft") setStatus("sent");
          }}
        />
      )}
    </div>
  );
}
