"use client";

import { useState, useSyncExternalStore } from "react";
import PriceForm, { draftFrom, readDraft } from "@/components/quoteRequest/PriceForm";
import { longDate } from "@/components/invoice/InvoiceDocument";
import { LinePrice, RequestItem, cellFor, formatPence, quantityText, supplierTotal } from "@/lib/quoteCompare";
import type { PublicQuoteRequest } from "@/lib/publicQuoteRequest";
import { saveFailed } from "@/lib/errorText";
import { SITE_NAME } from "@/lib/siteName";

type Sent = { prices: Record<string, LinePrice>; delivery: number | null; vatIncluded: boolean; validUntil: string | null; note: string };

// One supplier's prices, line by line, in their own VAT terms.
export function AnswerSummary({ items, answer }: { items: RequestItem[]; answer: Sent }) {
  const offer = { id: "", name: "", ...answer };
  const t = supplierTotal(offer, items);
  const inc = answer.vatIncluded;
  return (
    <div className="space-y-2 text-sm">
      <ul className="divide-y">
        {items.map((item) => {
          const c = cellFor(offer, item);
          return (
            <li key={item.id} className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block">{item.description}</span>
                <span className="block text-xs text-neutral-500">
                  {quantityText(item)}
                  {c.kind === "price" ? ` @ ${formatPence(Math.round(c.unit * 100))}` : ""}
                  {c.kind !== "missing" && c.note ? ` · ${c.note}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right">{c.kind === "price" ? formatPence(inc ? c.inc : c.ex) : c.kind === "unavailable" ? "Can't supply" : "No price"}</span>
            </li>
          );
        })}
      </ul>
      {t.deliveryEx > 0 && (
        <p className="flex justify-between"><span>Delivery</span><span>{formatPence(inc ? t.deliveryInc : t.deliveryEx)}</span></p>
      )}
      <p className="flex justify-between font-semibold"><span>Total {inc ? "inc" : "ex"} VAT</span><span>{formatPence(inc ? t.inc : t.ex)}</span></p>
      {answer.validUntil && <p className="text-neutral-600">Valid until {longDate(answer.validUntil)}.</p>}
      {answer.note && <p className="whitespace-pre-wrap text-neutral-600">{answer.note}</p>}
    </div>
  );
}

// The supplier's view of a request they were sent a link to: the list, and
// a form to price it once. Nothing about the sender beyond their name and
// what the email said.
export default function PublicRequestView({ data, token }: { data: PublicQuoteRequest; token: string }) {
  const ownerCopy = useSyncExternalStore(
    () => () => {},
    () => window.location.hash === "#o",
    () => false
  );
  const [draft, setDraft] = useState(() => draftFrom(data.items));
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<({ status: "replied" | "declined" } & Sent) | null>(null);
  const from = data.from || "the sender";
  const own = sent ?? (data.answer?.own ? data.answer : null);

  async function submit(decline: boolean) {
    setError(null);
    const read = readDraft(data.items, draft);
    if (!decline) {
      if (!read.ok) return setError(read.error);
      if (!Object.values(read.prices).some((p) => p.price !== null)) return setError("Nothing is priced. If you can't supply any of it, tap \"We can't quote for this\".");
    }
    setSending(true);
    try {
      const body = decline
        ? { token, decline: true, note: draft.note, name }
        : { token, prices: read.ok ? read.prices : {}, delivery: read.ok ? read.delivery : null, vatIncluded: draft.vatIncluded, validUntil: draft.validUntil || null, note: draft.note, name };
      const res = await fetch("/api/quote-requests/respond", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; status?: "replied" | "declined"; error?: string };
      if (!res.ok || !out.ok || !out.status) throw new Error(out.error || "That didn't work. Try again.");
      setSent({
        status: out.status,
        prices: out.status === "replied" && read.ok ? read.prices : {},
        delivery: out.status === "replied" && read.ok ? read.delivery : null,
        vatIncluded: draft.vatIncluded,
        validUntil: out.status === "replied" ? draft.validUntil || null : null,
        note: draft.note.trim(),
      });
      setDeclining(false);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(saveFailed(err, "That didn't work. Try again."));
    } finally {
      setSending(false);
    }
  }

  const showForm = !own && !data.answer && data.state === "open" && !ownerCopy;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Quote request</p>
        <h1 className="mt-1 text-2xl font-bold">{data.title}</h1>
        <p className="mt-1 text-neutral-600">
          {data.from || "The sender"} would like your prices{data.supplierName ? `, ${data.supplierName}` : ""}.
        </p>
        <dl className="mt-3 space-y-1 text-sm">
          {data.neededBy && (
            <div className="flex gap-2"><dt className="w-24 shrink-0 text-neutral-500">Needed by</dt><dd>{longDate(data.neededBy)}</dd></div>
          )}
          {data.siteAddress && (
            <div className="flex gap-2"><dt className="w-24 shrink-0 text-neutral-500">Deliver to</dt><dd className="whitespace-pre-line">{data.siteAddress}</dd></div>
          )}
        </dl>
        {data.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-700">{data.notes}</p>}
        {!showForm && !own && (
          <ul className="mt-3 divide-y border-t text-sm">
            {data.items.map((item) => (
              <li key={item.id} className="py-2">
                {item.description}
                <span className="block text-xs text-neutral-500">{quantityText(item)}{item.note ? ` · ${item.note}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Same as the quote page: the supplier presses Send prices and
          the answer -- a refused draft, or the thank-you that replaces the
          whole form -- was never spoken, on a page that says prices can
          only be sent once. */}
      <div aria-live="polite" className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        {own ? (
          own.status === "declined" ? (
            <p className="text-sm text-neutral-700">You said you can&apos;t quote for this. {data.from || "The sender"} has been told.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium">{sent ? `Thank you: your prices have gone to ${from}.` : `You sent these prices${data.answer?.at ? ` on ${longDate(data.answer.at.slice(0, 10))}` : ""}.`}</p>
              <AnswerSummary items={data.items} answer={own} />
              <p className="text-xs text-neutral-500">To change anything, contact {from}.</p>
            </div>
          )
        ) : data.answer ? (
          <p className="text-sm text-neutral-700">{data.from || "The sender"} already has your prices for this. Contact them if anything has changed.</p>
        ) : data.state === "closed" ? (
          <p className="text-sm text-neutral-700">This request is closed: {from} isn&apos;t taking prices for it any more.</p>
        ) : data.state === "expired" ? (
          <p className="text-sm text-neutral-700">
            This was needed by {longDate(data.neededBy!)}, so the request has closed. Contact {from} if you&apos;d still like to quote.
          </p>
        ) : ownerCopy ? (
          <p className="text-sm text-neutral-700">This is your copy of the link. The supplier sees a form here to price each line.</p>
        ) : declining ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">Tell {from} you can&apos;t quote for this?</p>
            <div>
              <label className="text-xs text-neutral-500" htmlFor="qr-decline-note">Reason (optional)</label>
              <input id="qr-decline-note" className="w-full rounded-lg border px-3 py-2" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} maxLength={2000} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => submit(true)} disabled={sending} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {sending ? "Sending…" : "Yes, we can't quote"}
              </button>
              <button onClick={() => setDeclining(false)} disabled={sending} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">Back</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="font-semibold">Your prices</h2>
            <PriceForm items={data.items} draft={draft} onChange={(d) => { setDraft(d); setError(null); }} disabled={sending}>
              <div>
                <label className="text-xs text-neutral-500" htmlFor="qr-name">Your name (optional)</label>
                <input id="qr-name" className="w-full rounded-lg border px-3 py-2" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
              </div>
            </PriceForm>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => submit(false)} disabled={sending} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {sending ? "Sending…" : "Send prices"}
              </button>
              <button onClick={() => { setError(null); setDeclining(true); }} disabled={sending} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
                We can&apos;t quote for this
              </button>
            </div>
            <p className="text-xs text-neutral-500">Prices can be sent once. To change them afterwards, contact {from}.</p>
          </div>
        )}
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
      <p className="text-center text-xs text-neutral-400">Sent with {SITE_NAME}</p>
    </div>
  );
}
