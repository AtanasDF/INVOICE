"use client";

import { longDate } from "@/components/invoice/InvoiceDocument";
import { money } from "@/lib/money";
import { invoiceBalance, invoiceVat } from "@/lib/invoiceBalance";
import type { BusinessProfile, Client, CreditNote, Invoice, InvoicePayment } from "@/lib/storage";
import { VAT_RATE_LABELS } from "@/lib/vat";
import { creditOffDue, invoiceCharge, labourNet } from "@/lib/cis";

// A deduction line (a deposit taken off) reads −£250.00, not £-250.00.
const signedMoney = (n: number) => `${n < 0 ? "−" : ""}${money(Math.abs(n))}`;

// The issued invoice as the customer sees it: on screen, printed, and as
// the PDF that's emailed or shared (forPdf drops notes meant for the owner).
export default function IssuedInvoice({ invoice, client, profile, creditNotes, payments, forPdf, logo }: {
  invoice: Invoice;
  client: Client | null;
  profile: BusinessProfile | null;
  creditNotes: CreditNote[];
  payments: InvoicePayment[];
  forPdf?: boolean;
  // The business logo as a data: URL (src/lib/logo.ts); nothing else is drawn.
  logo?: string | null;
}) {
  const vatRegistered = invoiceVat(invoice, profile?.vatRegistered ?? false);
  const totals = invoiceCharge(invoice, vatRegistered);
  const creditNoteTotal = creditNotes.reduce((s, c) => s + c.amount, 0);
  const paidSoFar = payments.reduce((s, p) => s + p.amount, 0);
  const amountDue = invoiceBalance({ total: totals.due, credited: creditOffDue(totals, creditNoteTotal), paid: paidSoFar, status: invoice.status });
  const cis = invoice.cisRate !== null;
  // After a credit note the CIS is on what's still billed, so Total, CIS,
  // credit notes and payments add up to the amount due.
  const billedShare = totals.total > 0 ? Math.max(0, 1 - creditNoteTotal / totals.total) : 0;
  const cisShown = Math.round(totals.cis * billedShare * 100) / 100;
  const labourShown = Math.max(0, labourNet(invoice.items)) * billedShare;
  return (
    <>
      <div className="flex items-start justify-between">
        {(profile?.businessName || logo) && (
          <div>
            {logo?.startsWith("data:image/") && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="mb-2 max-h-16 max-w-[12rem] object-contain object-left" />
            )}
            {profile?.businessName && <p className="text-lg font-bold">{profile.businessName}</p>}
            {profile?.address && <p className="whitespace-pre-line text-sm text-neutral-600">{profile.address}</p>}
            {vatRegistered && profile?.vatNumber && <p className="text-sm text-neutral-600">VAT: {profile.vatNumber}</p>}
          </div>
        )}
        <div className="text-right">
          <h1 className="wrap-anywhere text-2xl font-bold">Invoice {invoice.number}</h1>
          <p className="text-sm text-neutral-500">Date: {longDate(invoice.date)}</p>
          {invoice.paymentTerms && <p className="text-sm text-neutral-500">Terms: {invoice.paymentTerms}</p>}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-sm font-medium text-neutral-500">Billed to</p>
        <p className="wrap-anywhere font-medium">{client?.name || "—"}</p>
        {client?.address && <p className="whitespace-pre-line text-sm text-neutral-600">{client.address}</p>}
        {client?.email && <p className="text-sm text-neutral-600">{client.email}</p>}
        {client?.vatNumber && <p className="text-sm text-neutral-600">VAT: {client.vatNumber}</p>}
      </div>

      {/* min-w-0: a scroll box that is a flex item sizes to its content by
          default, so the table's min-content width pushed the whole page
          sideways instead of scrolling inside this. */}
      <div className="mt-6 min-w-0 overflow-x-auto print:overflow-visible">
        <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-neutral-500">
            <th className="py-2">Description</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Unit price</th>
            {vatRegistered && <th className="py-2 text-right">VAT</th>}
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((it, idx) => (
            <tr key={idx} className="border-b">
              <td className="wrap-anywhere py-2">
                {it.description}
                {cis && it.kind === "materials" && <span className="text-neutral-500"> (materials)</span>}
              </td>
              <td className="py-2 text-right">{it.quantity}</td>
              <td className="py-2 text-right">{money(it.unitPrice)}</td>
              {vatRegistered && <td className="py-2 text-right">{VAT_RATE_LABELS[it.vatRate]}</td>}
              <td className="py-2 text-right">{signedMoney(it.quantity * it.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>

      <div className="mt-4 space-y-1 text-sm">
        {vatRegistered && (
          <>
            <div className="flex justify-end text-neutral-600">
              <span>Subtotal (excl. VAT): {money(totals.subtotal)}</span>
            </div>
            {totals.vatByRate.map((v) => (
              <div key={v.kind} className="flex justify-end text-neutral-600">
                <span>{VAT_RATE_LABELS[v.kind]}: {money(v.vat)}</span>
              </div>
            ))}
            <div className="flex justify-end text-neutral-600">
              <span>Total: {money(totals.total)}</span>
            </div>
          </>
        )}
        {cis && (
          <>
            {!vatRegistered && (
              <div className="flex justify-end text-neutral-600">
                <span>Total: {money(totals.total)}</span>
              </div>
            )}
            <div className="flex justify-end text-neutral-600">
              <span>
                CIS deduction ({invoice.cisRate}% of {money(labourShown)} labour{creditNoteTotal > 0 ? " after credit" : ""}):{" "}
                <span className="whitespace-nowrap">{money(-cisShown)}</span>
              </span>
            </div>
          </>
        )}
        {creditNotes.map((c) => (
          <div key={c.id} className="flex justify-end text-neutral-500">
            <span>Credit note {longDate(c.date)}{c.reason ? ` (${c.reason})` : ""}: {money(-c.amount)}</span>
          </div>
        ))}
        {payments.map((p) => (
          <div key={p.id} className="flex justify-end text-neutral-500">
            <span>Payment received {longDate(p.date)}: {money(-p.amount)}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <div className="rounded-lg bg-neutral-50 px-5 py-3 text-right">
          <div className="text-2xl font-extrabold">Amount due: {money(amountDue)}</div>
          {invoice.dueDate && invoice.status !== "paid" && (
            <div className="text-base font-bold text-neutral-700">Due: {longDate(invoice.dueDate)}</div>
          )}
          {invoice.status === "paid" && <div className="text-base font-bold text-green-700">Paid</div>}
          {invoice.status === "partial" && paidSoFar === 0 && !forPdf && (
            <div className="mt-1 max-w-xs text-xs font-normal text-neutral-500 print:hidden">
              Marked part-paid before payments were recorded: record what came in below and the balance updates.
            </div>
          )}
        </div>
      </div>

      {invoice.notes && (
        <div className="mt-6 whitespace-pre-line border-t pt-4 text-sm text-neutral-600">{invoice.notes}</div>
      )}

      {profile?.bankDetails && (
        <div className="mt-4 rounded-lg border bg-neutral-50 p-4 text-sm">
          <p className="font-semibold">How to pay</p>
          <p className="mt-1 whitespace-pre-line text-neutral-600">{profile.bankDetails}</p>
        </div>
      )}

      {/* A limited company has to state its registered name and number on
          its invoices, whatever it trades as (Companies Act 2006 s.82).
          Nothing shows for a sole trader, who has neither. */}
      {profile?.registeredName && profile?.companyNumber && (
        <footer className="mt-6 border-t pt-3 text-xs text-neutral-500">
          Registered name: {profile.registeredName}. Company number: {profile.companyNumber}.
        </footer>
      )}
    </>
  );
}

