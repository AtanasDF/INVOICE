"use client";

import Link from "next/link";
import { money } from "@/lib/money";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BusinessProfile, Client, CreditNote, Invoice, InvoicePayment, businessProfileStore, clientsStore, creditNotesStore, invoicesStore, paymentsStore } from "@/lib/storage";
import { ShareButtons, useDocumentPdf } from "@/components/SendInvoicePanel";
import StatementDocument from "@/components/StatementDocument";
import Tip from "@/components/Tip";
import { buildStatement, statementText } from "@/lib/statement";
import { shortDate } from "@/lib/quoteStatus";
import { loadFailed } from "@/lib/errorText";
import { todayISO } from "@/lib/today";


const todayIso = () => todayISO();

// Everything one customer has been invoiced, what they've paid, and what is
// still owed — to print, share or send when chasing.
export default function StatementPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ client: Client | null; invoices: Invoice[]; credits: CreditNote[]; payments: InvoicePayment[]; profile: BusinessProfile } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const asAt = todayIso();

  useEffect(() => {
    Promise.all([clientsStore.all(), invoicesStore.all(), creditNotesStore.all(), paymentsStore.all(), businessProfileStore.get()])
      .then(([clients, invoices, credits, payments, profile]) =>
        setData({
          client: clients.find((c) => c.id === id) ?? null,
          invoices: invoices.filter((inv) => inv.clientId === id),
          credits,
          payments,
          profile,
        })
      )
      .catch((err) => setError(loadFailed(err, "the statement")));
  }, [id]);

  const statement = data ? buildStatement(data.invoices, data.credits, data.payments, data.profile.vatRegistered, asAt) : null;
  const client = data?.client ?? null;
  const sheet = statement && client ? <StatementDocument statement={statement} client={client} profile={data!.profile} asAt={asAt} /> : null;
  const text =
    statement && client
      ? statementText(statement, { from: data!.profile.businessName || "Your business", to: client.name, asAt, longDate: shortDate })
      : "";
  const pdf = useDocumentPdf({
    sheet,
    pdfKey: JSON.stringify([id, asAt, statement?.lines.map((l) => [l.number, l.balance])]),
    filename: `Statement ${client?.name ?? ""}.pdf`.replace(/\s+/g, " ").trim(),
    shareText: text,
  });

  async function copy() {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <Link href="/clients" className="text-sm text-neutral-500">← Customers &amp; suppliers</Link>
        <h1 className="mt-1 text-2xl font-bold">Statement</h1>
        <p className="mt-1 wrap-anywhere text-neutral-600">{client ? `Everything ${client.name} has been invoiced, and what's still owed.` : "Loading…"}</p>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <Tip id="statement-how">How it works: everything this customer has been invoiced, what they have paid, and what is still owed &mdash; ready to print or send when somebody asks &ldquo;what do I owe you?&rdquo;.</Tip>

      {statement && client && (
        <>
          <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm text-neutral-600">Owing as at {shortDate(asAt)}</span>
              <span className="text-2xl font-bold">{money(statement.outstanding)}</span>
            </div>
            {statement.overdue > 0 && (
              <p className="mt-1 text-sm text-amber-700">
                {money(statement.overdue)} of that is late{statement.oldest ? `, the oldest by ${statement.oldest.daysLate} days (${statement.oldest.number})` : ""}.
              </p>
            )}
            {statement.outstanding === 0 && <p className="mt-1 text-sm text-neutral-600">Nothing outstanding.</p>}
            <ShareButtons pdf={pdf}>
              <button type="button" onClick={() => window.print()} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
                Print
              </button>
              <button type="button" onClick={copy} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
                {copied ? "Copied" : "Copy the figures"}
              </button>
            </ShareButtons>
          </div>

          <div className="overflow-x-auto rounded-xl border bg-white p-5 shadow-sm print:border-0 print:p-0 print:shadow-none">
            <div className="min-w-[36rem]">{sheet}</div>
          </div>
        </>
      )}
      {pdf.sheetPortal}
    </div>
  );
}
