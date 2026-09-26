"use client";

import { ukDate } from "@/lib/today";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import QuoteDocument, { money, quoteTotal } from "@/components/quote/QuoteDocument";
import { longDate } from "@/components/invoice/InvoiceDocument";
import { PAGE_HEIGHT, PAGE_MARGIN, PAGE_WIDTH, renderInvoicePdf } from "@/lib/invoicePdf";
import SaveAsMenu from "@/components/SaveAsMenu";
import { pdfFilenameFor } from "@/components/SendInvoicePanel";
import type { PublicQuote } from "@/lib/publicQuote";
import { saveFailed, PDF_FAILED } from "@/lib/errorText";
import { SITE_NAME } from "@/lib/siteName";

type Answer = "accepted" | "declined";

// The customer's view of a quote they were sent a link to: the quote, a PDF
// to keep, and Accept / Decline, each confirmed before it counts.
export default function PublicQuoteView({ data, token }: { data: PublicQuote; token: string }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [making, setMaking] = useState(false);
  const [confirming, setConfirming] = useState<Answer | null>(null);
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  // `disabled={sending}` lands a render too late, so two taps in one tick both
  // post. The database rightly refuses the second, and the page then showed
  // that refusal -- "it may have been answered already... contact the sender"
  // -- beside the acceptance it had just made. A customer told to ring up a
  // moment after accepting.
  const answering = useRef(false);
  const [answered, setAnswered] = useState<Answer | null>(data.response?.answer ?? null);
  const [error, setError] = useState<string | null>(null);
  // The owner's own copy of the link (#o): they see what the customer sees,
  // without buttons that would answer for the customer.
  const ownerCopy = useSyncExternalStore(
    () => () => {},
    () => window.location.hash === "#o",
    () => false
  );
  const q = data.quote;
  const total = quoteTotal(q, data.profile.vatRegistered);
  const from = data.profile.businessName || "the sender";

  // As on invoice links: reported by the page's own script, not for the
  // owner's email copy (#o) or a browser signed in to the app.
  useEffect(() => {
    if (window.location.hash === "#o") return;
    let signedIn = false;
    try {
      signedIn = Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k));
    } catch {
      // Storage blocked: treat as signed out.
    }
    if (signedIn) return;
    fetch("/api/quote-links/seen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), keepalive: true }).catch(() => {});
  }, [token]);

  async function download() {
    if (!sheetRef.current) return;
    setMaking(true);
    try {
      const pdf = await renderInvoicePdf(sheetRef.current);
      pdf.save(pdfFilenameFor(q.number, "quote"));
    } catch (err) {
      { console.error("PDF failed:", err); setError(PDF_FAILED); }
    } finally {
      setMaking(false);
    }
  }

  async function answer(response: Answer) {
    if (answering.current) return;
    answering.current = true;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/quote-links/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, response, name }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error || "That didn't work. Try again.");
      setAnswered(response);
      setConfirming(null);
    } catch (err) {
      // An answer that failed is worth another try; one that worked is not.
      answering.current = false;
      setError(saveFailed(err, "That didn't work. Try again."));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Accepting is the one thing this page exists for, and every
          outcome is a paragraph swapped into this card. Pressing the button
          disables it, which blurs it, so a customer using a screen reader
          was left with no confirmation, no error, and focus on <body>.
          The card is here from first paint, so the region is registered
          before its contents change. */}
      <div aria-live="polite" className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:hidden">
        {answered === "accepted" ? (
          <p className="text-sm font-medium text-green-800">
            You accepted this quote{data.response?.at ? ` on ${longDate(ukDate(data.response.at))}` : ""}. {from} has been told and will be in touch.
          </p>
        ) : answered === "declined" ? (
          <p className="text-sm text-neutral-700">You declined this quote. {from} has been told.</p>
        ) : q.status === "accepted" || q.status === "invoiced" ? (
          <p className="text-sm text-neutral-700">This quote has been accepted.</p>
        ) : q.status === "declined" ? (
          <p className="text-sm text-neutral-700">This quote was declined.</p>
        ) : data.expired ? (
          <p className="text-sm text-neutral-700">
            This quote was valid until {longDate(q.validUntil!)}. Please contact {from} for an up-to-date one.
          </p>
        ) : ownerCopy ? (
          <p className="text-sm text-neutral-700">This is your copy of the link. Your customer sees Accept and Decline buttons here.</p>
        ) : confirming ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              {confirming === "accepted" ? `Accept quote ${q.number} for ${money(total)}?` : `Decline quote ${q.number}?`}
            </p>
            <div>
              <label className="text-xs text-neutral-500" htmlFor="responder-name">Your name</label>
              <input id="responder-name" className="w-full rounded-lg border px-3 py-2" placeholder="e.g. Jane Smith" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => answer(confirming)} disabled={sending} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {sending ? "Sending…" : confirming === "accepted" ? "Yes, accept the quote" : "Yes, decline it"}
              </button>
              <button onClick={() => setConfirming(null)} disabled={sending} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
                Back
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-700">
              {from} sent you this quote for {money(total)}
              {q.validUntil ? `, valid until ${longDate(q.validUntil)}` : ""}.
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setConfirming("accepted")} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
                Accept quote
              </button>
              <button onClick={() => setConfirming("declined")} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
                Decline
              </button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex justify-end gap-2 print:hidden">
        <button onClick={download} disabled={making} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50">
          {making ? "Making the PDF…" : "Download PDF"}
        </button>
        <SaveAsMenu sheet={() => sheetRef.current} name={`Quote ${q.number}`} onPdf={download} />
        <button onClick={() => window.print()} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
          Print
        </button>
      </div>

      <div className="rounded-xl border bg-white p-6 text-neutral-900 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <QuoteDocument quote={q} client={data.client} profile={data.profile} logo={data.logo} />
      </div>
      <p className="text-center text-xs text-neutral-400 print:hidden">Sent with {SITE_NAME}</p>
      <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }}>
        <div ref={sheetRef} className="bg-white text-neutral-900" style={{ width: PAGE_WIDTH, minHeight: PAGE_HEIGHT, padding: PAGE_MARGIN }}>
          <QuoteDocument quote={q} client={data.client} profile={data.profile} logo={data.logo} />
        </div>
      </div>
    </div>
  );
}
