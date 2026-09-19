"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import InvoiceDocument, { bankRows, formatMoney, longDate } from "@/components/invoice/InvoiceDocument";
import { computeDraftTotals, FreeInvoiceDraft } from "@/lib/freeInvoiceDraft";
import { PAGE_HEIGHT, PAGE_MARGIN, PAGE_WIDTH, renderInvoicePdf } from "@/lib/invoicePdf";
import { supabase } from "@/lib/supabaseClient";
import { INPUT } from "@/components/free-invoice/fields";

type Status =
  | { kind: "idle" }
  | { kind: "working"; step: string }
  | { kind: "sent"; to: string; copied: boolean; number: string }
  | { kind: "error"; message: string };

export function pdfFilename(d: FreeInvoiceDraft): string {
  return `Invoice${d.number ? `-${d.number.replace(/[^\w.-]+/g, "-")}` : ""}.pdf`;
}

export default function SendByEmail({ draft, onSent }: { draft: FreeInvoiceDraft; onSent?: () => void }) {
  const { user } = useAuth();
  const sheetRef = useRef<HTMLDivElement>(null);
  // Follows the customer's email until the sender types their own.
  const [typedTo, setTypedTo] = useState<string | null>(null);
  const to = typedTo ?? draft.customer.email ?? "";
  const [message, setMessage] = useState("");
  const [copyToSelf, setCopyToSelf] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // A new invoice number is a new invoice: the recipient, the message and
  // "Sent" all belonged to the old one. A send still in flight reports
  // under the number it was sent with.
  const [statusFor, setStatusFor] = useState(draft.number);
  if (statusFor !== draft.number) {
    setStatusFor(draft.number);
    setTypedTo(null);
    setMessage("");
    if (status.kind !== "working") setStatus({ kind: "idle" });
  }
  const accountEmail = user?.email ?? "";
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
    const number = draft.number;
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
          issuerEmail: draft.issuer.email?.trim() ?? "",
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
      setStatus({ kind: "sent", to: body.to ?? to, copied: !!body.copied, number });
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
      {!user ? (
        <div className="mt-4 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
          <p>Sending by email needs a free account, so every invoice sent from here comes from a real person. This invoice stays as it is.</p>
          <Link href="/login?next=/free-invoice" className="mt-3 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
            Sign in or sign up to send
          </Link>
        </div>
      ) : status.kind === "sent" ? (
        <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          <p className="font-medium">
            {status.number ? `Invoice ${status.number} sent` : "Sent"} to {status.to}.
          </p>
          {status.copied && <p className="mt-0.5">A copy went to {accountEmail}.</p>}
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
              onChange={(e) => setTypedTo(e.target.value)}
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
          {accountEmail && (
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={copyToSelf} onChange={(e) => setCopyToSelf(e.target.checked)} />
              Send me a copy ({accountEmail})
            </label>
          )}
          {!draft.issuer.email?.trim() && <p className="text-xs text-neutral-500">Replies go to {accountEmail || "your account email"}. Add an email under Your business to use a different one.</p>}
          {status.kind === "error" && <p className="text-sm text-red-600">{status.message}</p>}
          <button type="submit" disabled={working} className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 sm:w-auto">
            {working ? status.step : "Send invoice"}
          </button>
        </form>
      )}
      {/* Same sheet as ScaledPreview, unscaled, so the PDF is the preview. */}
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
