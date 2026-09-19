"use client";

import { useEffect, useRef, useState } from "react";
import IssuedInvoice from "@/components/invoice/IssuedInvoice";
import { PAGE_HEIGHT, PAGE_MARGIN, PAGE_WIDTH, renderInvoicePdf } from "@/lib/invoicePdf";
import { pdfFilenameFor } from "@/components/SendInvoicePanel";
import type { PublicInvoice } from "@/lib/publicInvoice";

// The customer's view of an invoice they were sent a link to: the invoice
// itself, a PDF to keep, and a quiet "opened" signal back to the sender.
export default function PublicInvoiceView({ data, token }: { data: PublicInvoice; token: string }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [making, setMaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sent from the browser, after the page has actually run: email link
  // scanners fetch the HTML but rarely run it, so they don't count as
  // opening it. The owner's own browser (signed in here) doesn't either.
  useEffect(() => {
    const signedIn = Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k));
    if (signedIn) return;
    fetch("/api/invoice-links/seen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), keepalive: true }).catch(() => {});
  }, [token]);

  async function download() {
    if (!sheetRef.current) return;
    setMaking(true);
    setError(null);
    try {
      const pdf = await renderInvoicePdf(sheetRef.current);
      pdf.save(pdfFilenameFor(data.invoice.number));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make the PDF.");
    } finally {
      setMaking(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-neutral-600">
          {data.profile.businessName ? `${data.profile.businessName} sent you this invoice.` : "You were sent this invoice."}
        </p>
        <div className="flex gap-2">
          <button onClick={download} disabled={making} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {making ? "Making the PDF…" : "Download PDF"}
          </button>
          <button onClick={() => window.print()} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
            Print
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="rounded-xl border bg-white p-8 text-neutral-900 shadow-sm print:border-0 print:shadow-none">
        <IssuedInvoice invoice={data.invoice} client={data.client} profile={data.profile} creditNotes={data.creditNotes} payments={data.payments} forPdf />
      </div>
      <p className="text-center text-xs text-neutral-400 print:hidden">Sent with Invoicer</p>
      <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }}>
        <div ref={sheetRef} className="bg-white text-neutral-900" style={{ width: PAGE_WIDTH, minHeight: PAGE_HEIGHT, padding: PAGE_MARGIN }}>
          <IssuedInvoice invoice={data.invoice} client={data.client} profile={data.profile} creditNotes={data.creditNotes} payments={data.payments} forPdf />
        </div>
      </div>
    </div>
  );
}
