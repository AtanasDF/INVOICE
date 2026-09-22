"use client";

import { ReactNode, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import { PAGE_HEIGHT, PAGE_MARGIN, PAGE_WIDTH, renderInvoicePdf } from "@/lib/invoicePdf";
import SaveAsMenu from "@/components/SaveAsMenu";
import { supabase } from "@/lib/supabaseClient";
import { INPUT } from "@/components/free-invoice/fields";
import { saveFailed } from "@/lib/errorText";

type Status =
  | { kind: "idle" }
  | { kind: "working"; step: string }
  | { kind: "sent"; to: string; copied: boolean; number: string }
  | { kind: "error"; message: string };

// What the email says about the invoice; the PDF is made from `sheet`.
export type InvoiceEmailFields = {
  issuerName: string;
  issuerEmail: string;
  customerName: string;
  customerEmail: string;
  number: string;
  total: string;
  dueDate: string;
  bank: [string, string][];
};

export type SendDocType = "invoice" | "quote";

export function pdfFilenameFor(number: string, docType: SendDocType = "invoice"): string {
  return `${docType === "quote" ? "Quote" : "Invoice"}${number ? `-${number.replace(/[^\w.-]+/g, "-")}` : ""}.pdf`;
}

// The words that go with the PDF in the share sheet.
export function shareMessageFor(fields: InvoiceEmailFields, docType: SendDocType, viewUrl: string): string {
  const quote = docType === "quote";
  const text = `${quote ? "Quote" : "Invoice"}${fields.number ? ` ${fields.number}` : ""}${fields.issuerName ? ` from ${fields.issuerName}` : ""}: ${fields.total}${fields.dueDate ? `, ${quote ? "valid until" : "due"} ${fields.dueDate}` : ""}.`;
  return viewUrl ? `${text}\n${viewUrl}` : text;
}

// `sheet` rendered off-screen at A4 and the PDF made from it. The last PDF
// is kept, keyed by `pdfKey` (which changes whenever the content does), so a
// second tap on Share can open the share sheet at once: iOS only allows that
// straight after a tap, not after a second or two of making the PDF.
export function useDocumentPdf({ sheet, pdfKey, filename, shareText }: { sheet: ReactNode; pdfKey: string; filename: string; shareText: string }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<{ key: string; blob: Blob; base64: string; save: (filename: string) => void } | null>(null);
  const [shareState, setShareState] = useState<"idle" | "making" | "ready" | "error">("idle");
  const [shareError, setShareError] = useState<string | null>(null);

  async function currentPdf() {
    if (pdfRef.current?.key === pdfKey) return pdfRef.current;
    if (!sheetRef.current) throw new Error("The invoice isn't ready yet.");
    const pdf = await renderInvoicePdf(sheetRef.current);
    pdfRef.current = { key: pdfKey, ...pdf };
    return pdfRef.current;
  }

  async function share() {
    setShareError(null);
    const cached = pdfRef.current?.key === pdfKey;
    try {
      if (!cached) setShareState("making");
      const pdf = await currentPdf();
      const file = new File([pdf.blob], filename, { type: "application/pdf" });
      if (!navigator.canShare?.({ files: [file] })) {
        pdf.save(filename);
        setShareState("idle");
        return;
      }
      try {
        await navigator.share({ files: [file], title: filename, text: shareText });
        setShareState("idle");
      } catch (err) {
        if ((err as Error).name === "AbortError") setShareState("idle");
        // Too long since the tap: the PDF is made, so the next tap shares at once.
        else setShareState("ready");
      }
    } catch (err) {
      setShareState("error");
      setShareError(saveFailed(err, "Couldn't make the PDF."));
    }
  }

  async function download() {
    setShareError(null);
    try {
      const pdf = await currentPdf();
      pdf.save(filename);
    } catch (err) {
      setShareError(saveFailed(err, "Couldn't make the PDF."));
    }
  }

  // The printed A4 sheet, unscaled, so the PDF is what the preview shows.
  const sheetPortal = createPortal(
    <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }}>
      <div ref={sheetRef} className="bg-white text-neutral-900" style={{ width: PAGE_WIDTH, minHeight: PAGE_HEIGHT, padding: PAGE_MARGIN }}>
        {sheet}
      </div>
    </div>,
    document.body
  );

  return { currentPdf, share, download, shareState, shareError, sheetPortal, sheetRef, filename };
}

export type DocumentPdf = ReturnType<typeof useDocumentPdf>;

export function ShareButtons({ pdf, children }: { pdf: DocumentPdf; children?: ReactNode }) {
  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={pdf.share}
          disabled={pdf.shareState === "making"}
          className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${pdf.shareState === "ready" ? "bg-neutral-900 text-white" : "border text-neutral-700"}`}
        >
          {pdf.shareState === "making" ? "Making the PDF…" : pdf.shareState === "ready" ? "Ready — tap to share" : "Share (WhatsApp, Messages…)"}
        </button>
        <button type="button" onClick={pdf.download} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
          Download PDF
        </button>
        <SaveAsMenu sheet={() => pdf.sheetRef.current} name={pdf.filename.replace(/\.pdf$/, "")} onPdf={pdf.download} />
        {children}
      </div>
      {pdf.shareError && <p role="alert" className="mt-2 text-sm text-red-600">{pdf.shareError}</p>}
    </>
  );
}

// Email it with the PDF attached (signed in only).
export function EmailForm({
  pdf,
  fields,
  signInNext,
  missingName,
  resetKey = "",
  docType = "invoice",
  viewUrl = "",
  ensureViewUrl,
  onSent,
}: {
  pdf: DocumentPdf;
  fields: InvoiceEmailFields;
  signInNext: string;
  missingName: string;
  // Changes when the page starts a different invoice, even one without a
  // number yet.
  resetKey?: string | number;
  docType?: SendDocType;
  // The invoice's online link if it has one, and a way to make it when an
  // email is sent (the email then carries a "View invoice online" button).
  viewUrl?: string;
  ensureViewUrl?: () => Promise<string>;
  onSent?: () => void;
}) {
  const { user } = useAuth();
  // Follows the customer's email until the sender types their own.
  const [typedTo, setTypedTo] = useState<string | null>(null);
  const to = typedTo ?? fields.customerEmail;
  const [message, setMessage] = useState("");
  const [copyToSelf, setCopyToSelf] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // A new invoice number is a new invoice: the recipient, the message and
  // "Sent" all belonged to the old one. A send still in flight reports
  // under the number it was sent with.
  const invoiceKey = `${fields.number}|${resetKey}`;
  const [statusFor, setStatusFor] = useState(invoiceKey);
  if (statusFor !== invoiceKey) {
    setStatusFor(invoiceKey);
    setTypedTo(null);
    setMessage("");
    if (status.kind !== "working") setStatus({ kind: "idle" });
  }
  const accountEmail = user?.email ?? "";
  const working = status.kind === "working";
  const quote = docType === "quote";
  const word = quote ? "quote" : "invoice";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!fields.issuerName.trim()) {
      setStatus({ kind: "error", message: missingName });
      return;
    }
    const number = fields.number;
    try {
      setStatus({ kind: "working", step: "Making the PDF…" });
      const { base64 } = await pdf.currentPdf();
      // A link that can't be made just leaves the button out of the email.
      const link = ensureViewUrl ? await ensureViewUrl().catch(() => "") : viewUrl;
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
          issuerName: fields.issuerName,
          issuerEmail: fields.issuerEmail.trim(),
          customerName: fields.customerName,
          number: fields.number,
          total: fields.total,
          dueDate: fields.dueDate,
          bank: fields.bank,
          docType,
          viewUrl: link,
          pdf: base64,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { sent?: boolean; to?: string; copied?: boolean; error?: string };
      if (!res.ok || !body.sent) throw new Error(body.error || `The email couldn't be sent (${res.status}).`);
      setStatus({ kind: "sent", to: body.to ?? to, copied: !!body.copied, number });
      onSent?.();
    } catch (err) {
      setStatus({ kind: "error", message: saveFailed(err, "The email couldn't be sent.") });
    }
  }

  if (!user) {
    return (
      <div className="mt-4 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
        <p>Sending by email needs a free sign-in, so everything sent from here comes from a real person. This {word} stays as it is.</p>
        <Link href={`/login?next=${encodeURIComponent(signInNext)}`} className="mt-3 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          Sign in to send (it&apos;s free)
        </Link>
      </div>
    );
  }
  if (status.kind === "sent") {
    return (
      <div role="status" className="mt-4 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-800">
        <p className="font-medium">
          {status.number ? `${quote ? "Quote" : "Invoice"} ${status.number} sent` : "Sent"} to {status.to}.
        </p>
        {status.copied && <p className="mt-0.5">A copy went to {accountEmail}.</p>}
        <button type="button" onClick={() => setStatus({ kind: "idle" })} className="mt-2 text-sm font-medium underline">
          Send again
        </button>
      </div>
    );
  }
  return (
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
          placeholder={`Please find attached ${word}${fields.number ? ` ${fields.number}` : ""}. Thank you.`}
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
      <p className="text-xs text-neutral-500">Replies go to {accountEmail || "your account email"}.</p>
      {status.kind === "error" && <p role="alert" className="text-sm text-red-600">{status.message}</p>}
      <button type="submit" disabled={working} className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 sm:w-auto">
        {working ? status.step : `Send ${word}`}
      </button>
    </form>
  );
}

// Email it (signed in only), share the PDF through the phone's share sheet,
// or download it.
export default function SendInvoicePanel({
  sheet,
  pdfKey,
  fields,
  signInNext,
  missingName,
  resetKey = "",
  docType = "invoice",
  viewUrl = "",
  ensureViewUrl,
  onSent,
}: {
  sheet: ReactNode;
  pdfKey: string;
  fields: InvoiceEmailFields;
  signInNext: string;
  missingName: string;
  resetKey?: string | number;
  docType?: SendDocType;
  viewUrl?: string;
  ensureViewUrl?: () => Promise<string>;
  onSent?: () => void;
}) {
  const quote = docType === "quote";
  const pdf = useDocumentPdf({ sheet, pdfKey, filename: pdfFilenameFor(fields.number, docType), shareText: shareMessageFor(fields, docType, viewUrl) });
  return (
    <section id="send-by-email" className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:hidden">
      <h2 className="font-semibold">Send it</h2>
      <p className="mt-1 text-sm text-neutral-600">
        {fields.total}
        {fields.number ? ` · ${fields.number}` : ""} goes as a PDF{quote ? "." : ", with your payment details in the email."}
      </p>
      <EmailForm
        pdf={pdf}
        fields={fields}
        signInNext={signInNext}
        missingName={missingName}
        resetKey={resetKey}
        docType={docType}
        viewUrl={viewUrl}
        ensureViewUrl={ensureViewUrl}
        onSent={onSent}
      />
      <div className="mt-5 border-t pt-4">
        <p className="text-xs text-neutral-500">Or share it yourself</p>
        <ShareButtons pdf={pdf} />
      </div>
      {pdf.sheetPortal}
    </section>
  );
}
