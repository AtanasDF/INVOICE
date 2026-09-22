import { longDate } from "@/components/invoice/InvoiceDocument";
import type { BusinessProfile, Client, Quote } from "@/lib/storage";
import { VAT_RATE_LABELS, computeInvoiceTotals } from "@/lib/vat";
import { depositGross } from "@/lib/quoteDeposit";

export const money = (n: number) => `£${(Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function quoteTotal(quote: Quote, vatRegistered: boolean): number {
  return Math.round(computeInvoiceTotals(quote.items, vatRegistered).total * 100) / 100;
}

// The quote as the client sees it: on screen, printed and as the PDF.
export default function QuoteDocument({ quote, client, profile, logo }: { quote: Quote; client: Client | null; profile: BusinessProfile | null; logo?: string | null }) {
  const vatRegistered = profile?.vatRegistered ?? false;
  const totals = computeInvoiceTotals(quote.items, vatRegistered);
  const deposit = depositGross(quote, vatRegistered);
  return (
    <>
      <div className="flex items-start justify-between gap-6">
        <div>
          {logo?.startsWith("data:image/") && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="mb-2 max-h-16 max-w-[12rem] object-contain object-left" />
          )}
          {profile?.businessName && <p className="text-lg font-bold">{profile.businessName}</p>}
          {profile?.address && <p className="whitespace-pre-line text-sm text-neutral-600">{profile.address}</p>}
          {vatRegistered && profile?.vatNumber && <p className="text-sm text-neutral-600">VAT: {profile.vatNumber}</p>}
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-bold">Quote {quote.number}</h1>
          <p className="text-sm text-neutral-500">Date: {longDate(quote.date)}</p>
          {quote.validUntil && <p className="text-sm text-neutral-500">Valid until: {longDate(quote.validUntil)}</p>}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-sm font-medium text-neutral-500">For</p>
        <p className="font-medium">{client?.name || "—"}</p>
        {client?.isCompany && client.contactPerson && <p className="text-sm text-neutral-600">Attn: {client.contactPerson}</p>}
        {client?.address && <p className="whitespace-pre-line text-sm text-neutral-600">{client.address}</p>}
        {client?.email && <p className="text-sm text-neutral-600">{client.email}</p>}
        {client?.isCompany && client.vatNumber && <p className="text-sm text-neutral-600">VAT: {client.vatNumber}</p>}
      </div>

      <div className="mt-6 overflow-x-auto print:overflow-visible">
        <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-neutral-500">
            <th className="py-2">Description</th>
            <th className="py-2 pl-3 text-right">Qty</th>
            <th className="py-2 pl-3 text-right">Unit price</th>
            {vatRegistered && <th className="py-2 pl-3 text-right">VAT</th>}
            <th className="py-2 pl-3 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {quote.items.map((it, idx) => (
            <tr key={idx} className="border-b">
              <td className="wrap-anywhere py-2">{it.description}</td>
              <td className="py-2 pl-3 text-right">{it.quantity}</td>
              <td className="py-2 pl-3 text-right">{money(it.unitPrice)}</td>
              {vatRegistered && <td className="py-2 pl-3 text-right">{VAT_RATE_LABELS[it.vatRate]}</td>}
              <td className="py-2 pl-3 text-right">{money(it.quantity * it.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>

      {vatRegistered && (
        <section className="mt-4 space-y-1 text-right text-sm text-neutral-600">
          <p>Subtotal (excl. VAT): {money(totals.subtotal)}</p>
          {totals.vatByRate.map((v) => (
            <p key={v.kind}>
              {VAT_RATE_LABELS[v.kind]}: {money(v.vat)}
            </p>
          ))}
        </section>
      )}
      <section className="mt-4 flex justify-end">
        <div className="rounded-lg bg-neutral-50 px-5 py-3 text-right">
          <p className="text-2xl font-extrabold">Total: {money(totals.total)}</p>
          {deposit !== null && deposit > 0 && (
            <p className="text-sm text-neutral-700">
              Deposit to book the work: {money(deposit)}
              {quote.deposit?.kind === "percent" ? ` (${quote.deposit.value}%)` : ""}
            </p>
          )}
          {quote.validUntil && <p className="text-sm text-neutral-600">This quote is valid until {longDate(quote.validUntil)}.</p>}
        </div>
      </section>

      {quote.notes && <p className="mt-6 whitespace-pre-line border-t pt-4 text-sm text-neutral-600">{quote.notes}</p>}
    </>
  );
}
