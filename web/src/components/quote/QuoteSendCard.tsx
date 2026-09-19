"use client";

import { ReactNode, useId, useState } from "react";
import { EmailForm, InvoiceEmailFields, ShareButtons, pdfFilenameFor, shareMessageFor, useDocumentPdf } from "@/components/SendInvoicePanel";
import TextCustomer from "@/components/TextCustomer";
import { QuoteSummary, phoneLinks } from "@/lib/customerText";
import type { Client } from "@/lib/storage";

type Way = "email" | "sms" | "whatsapp" | "pdf";
const WAYS: { id: Way; label: string }[] = [
  { id: "email", label: "Email" },
  { id: "sms", label: "Text" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "pdf", label: "PDF" },
];

// Every way to get a quote to the customer, one tap apart: email with the
// PDF, a text or WhatsApp with the private link, or the PDF itself to share,
// save or print. Opens on the way their saved details allow.
export default function QuoteSendCard({
  sheet,
  pdfKey,
  fields,
  quoteId,
  viewUrl,
  ensureViewUrl,
  onSent,
  client,
  textLink,
  makeTextLink,
  summary,
  children,
}: {
  sheet: ReactNode;
  pdfKey: string;
  fields: InvoiceEmailFields;
  quoteId: string;
  viewUrl: string;
  ensureViewUrl: () => Promise<string>;
  onSent: () => void;
  client: Client | null;
  textLink: string;
  makeTextLink: () => Promise<string>;
  summary: QuoteSummary;
  children?: ReactNode;
}) {
  const [way, setWay] = useState<Way>(() => (!client?.email && client && phoneLinks(client.phone) ? "sms" : "email"));
  const id = useId();
  const pdf = useDocumentPdf({ sheet, pdfKey, filename: pdfFilenameFor(fields.number, "quote"), shareText: shareMessageFor(fields, "quote", viewUrl) });
  // Text and WhatsApp share one message, so one panel.
  const panelOf = (w: Way) => (w === "whatsapp" ? "sms" : w);
  const panel = (key: Way) => ({
    role: "tabpanel",
    id: `${id}-panel-${key}`,
    "aria-labelledby": `${id}-tab-${panelOf(way) === key ? way : key}`,
    hidden: panelOf(way) !== key,
  });

  return (
    <section id="send-quote" className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:hidden">
      <h2 className="font-semibold">Send</h2>
      <p className="mt-1 text-sm text-neutral-600">
        {fields.total} · {fields.number}
        {summary.validUntil ? `, valid until ${summary.validUntil}` : ""}
      </p>
      <div role="tablist" aria-label="How to send it" className="mt-4 grid grid-cols-4 gap-1 rounded-lg bg-neutral-100 p-1">
        {WAYS.map((w) => (
          <button
            key={w.id}
            type="button"
            role="tab"
            id={`${id}-tab-${w.id}`}
            aria-selected={way === w.id}
            aria-controls={`${id}-panel-${panelOf(w.id)}`}
            onClick={() => setWay(w.id)}
            className={`rounded-md px-1 py-2 text-sm font-medium ${way === w.id ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}
          >
            {w.label}
          </button>
        ))}
      </div>

      <div {...panel("email")}>
        <EmailForm
          pdf={pdf}
          fields={fields}
          docType="quote"
          resetKey={quoteId}
          signInNext={`/quotes/${quoteId}`}
          missingName="Add your business name in Settings first, so the customer knows who it's from."
          viewUrl={viewUrl}
          ensureViewUrl={ensureViewUrl}
          onSent={onSent}
        />
      </div>

      <div {...panel("sms")} className="mt-4">
        {client ? (
          <TextCustomer
            client={client}
            from={fields.issuerName}
            presets={["quote", "onMyWay", "late", "arrived"]}
            link={textLink}
            makeLink={makeTextLink}
            quote={summary}
            via={way === "whatsapp" ? "whatsapp" : "sms"}
          />
        ) : (
          <p className="text-sm text-neutral-600">Pick who the quote is for first (Edit).</p>
        )}
      </div>

      <div {...panel("pdf")} className="mt-4">
        <p className="text-sm text-neutral-600">The quote as a PDF, to send from any app, keep or print.</p>
        <ShareButtons pdf={pdf}>
          <button type="button" onClick={() => window.print()} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
            Print
          </button>
        </ShareButtons>
      </div>

      {children}
      {pdf.sheetPortal}
    </section>
  );
}
