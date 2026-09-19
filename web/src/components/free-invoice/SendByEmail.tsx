"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import InvoiceDocument, { bankRows, formatMoney, longDate } from "@/components/invoice/InvoiceDocument";
import { computeDraftTotals, FreeInvoiceDraft } from "@/lib/freeInvoiceDraft";
import { renderInvoicePdf } from "@/lib/invoicePdf";
import { supabase } from "@/lib/supabaseClient";
import { INPUT } from "@/components/free-invoice/fields";

// Same sheet as ScaledPreview, unscaled, so the PDF is the preview.
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
const PAGE_MARGIN = 53;

type Status = { kind: "idle" } | { kind: "working"; step: string } | { kind: "sent"; to: string; copied: boolean } | { kind: "error"; message: string };

export function pdfFilename(d: FreeInvoiceDraft): string {
  return `Invoice${d.number ? `-${d.number.replace(/[^\w.-]+/g, "-")}` : ""}.pdf`;
}

export default function SendByEmail({ draft, onSent }: { draft: FreeInvoiceDraft; onSent?: () => void }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [to, setTo] = useState(draft.customer.email ?? "");
  const [message, setMessage] = useState("");
  const [copyToSelf, setCopyToSelf] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const issuerEmail = draft.issuer.email?.trim() ?? "";
  const t = computeDraftTotals(draft);
  const due = draft.cis.enabled ? t.netPaymentDue : t.total;
  const working = status.kind === "working";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.issuer.name?.trim()) {
      setStatus({ kind: "error", message: "Add your business name first, so the customer knows who it's from." });
      return;
    }
    if (!sheetRef.current) return;
    try {
      setStatus({ kind: "working", step: "Making the PDF…" });
      const { base64 } = await renderInvoicePdf(sheetRef.current);
      setStatus({ kind: "working", step: "Sending…" });
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const { data: { session } } = await supabase.auth.getSession();
      if (session) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch("/api/send-invoice", {
        method: "POST",
        headers,
        body: JSON.stringify({
          to: to.trim(),
          message: message.trim(),
          copyToSelf,
          issuerName: draft.issuer.name,
          issuerEmail,
          customerName: draft.customer.name ?? "",
          number: draft.number,
          total: formatMoney(draft.currencySymbol, due),
          dueDate: draft.dueDate ? longDate(draft.dueDate) : "",
          bank: bankRows(draft),
          pdf: base64,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { sent?: boolean; to?: string; copied?: boolean; error?: string };
      if (!res.ok || !body.sent) throw new Error(body.error || `The email couldn't be sent (${res.status}).`);
      setStatus({ kind: "sent", to: body.to ?? to, copied: !!body.copied });
      onSent?.();
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "The email couldn't be sent." });
    }
  }

  return (
    <section id="send-by-email" className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
      <h2 className="font-semibold">Send by email</h2>
      <p className="mt-1 text-sm text-neutral-600">
        {formatMoney(draft.currencySymbol, due)}
        {draft.number ? ` · ${draft.number}` : ""} goes as a PDF, with your payment details in the email.
      </p>
      {status.kind === "sent" ? (
        <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          <p className="font-medium">Sent to {status.to}.</p>
          {status.copied && <p className="mt-0.5">A copy went to {issuerEmail}.</p>}
          <button type="button" onClick={() => setStatus({ kind: "idle" })} className="mt-2 text-sm font-medium underline">
            Send again
          </button>
        </div>
      ) : (
        <form onSubmit={send} className="mt-4 space-y-3">
          <div>
            <label className="text-xs text-neutral-500" htmlFor="send-to">Send to</label>
            <input
              id="send-to"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              className={INPUT}
              placeholder="customer@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500" htmlFor="send-message">Message (optional)</label>
            <textarea
              id="send-message"
              rows={3}
              className={INPUT}
              placeholder={`Please find attached invoice${draft.number ? ` ${draft.number}` : ""}. Thank you.`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          {issuerEmail && (
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={copyToSelf} onChange={(e) => setCopyToSelf(e.target.checked)} />
              Send me a copy ({issuerEmail})
            </label>
          )}
          {!issuerEmail && <p className="text-xs text-neutral-500">Add your email under Your business so replies come to you.</p>}
          {status.kind === "error" && <p className="text-sm text-red-600">{status.message}</p>}
          <button type="submit" disabled={working} className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 sm:w-auto">
            {working ? status.step : "Send invoice"}
          </button>
        </form>
      )}
      {createPortal(
        <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }}>
          <div ref={sheetRef} className="bg-white text-neutral-900" style={{ width: PAGE_WIDTH, minHeight: PAGE_HEIGHT, padding: PAGE_MARGIN }}>
            <InvoiceDocument draft={draft} />
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}
