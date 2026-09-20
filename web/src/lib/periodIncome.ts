import { invoiceCharge } from "@/lib/cis";
import { invoiceVat } from "@/lib/invoiceBalance";
import type { CreditNote, Invoice } from "@/lib/storage";

// Income for the chosen period, by the same rules as the tax card
// (src/lib/taxEstimate.ts). Two things this used to get wrong:
//
//  - It counted DRAFTS. A draft has no number, has been sent to nobody and
//    may never be sent; three of them written up in advance made the month
//    look profitable and the Net figure was money that did not exist.
//  - It ignored CREDIT NOTES entirely. Invoice a customer £2,000, credit
//    the lot back the same week, and the month still read £2,000 of income.
//
// Deliberately excl. VAT, unlike the invoices list/detail pages which show
// the gross "amount due" -- VAT collected on an invoice isn't this
// account's income, it's money held for HMRC. Each invoice is charged under
// the VAT setting it was ISSUED with, not today's.
//
// The credited share accumulates over every credit note against an invoice
// in date order, but only the notes falling in the period come off that
// period's income: capping per period instead would let a £1,000 invoice
// credited in full twice, in two different months, come off twice.
export function incomeOf(invoices: Invoice[], creditNotes: CreditNote[], vatRegistered: boolean, inPeriod: (d: string) => boolean) {
  const issued = invoices.filter((inv) => inv.status !== "draft");
  const byId = new Map(issued.map((inv) => [inv.id, inv]));
  let income = issued
    .filter((inv) => inPeriod(inv.date))
    .reduce((s, inv) => s + invoiceCharge(inv, invoiceVat(inv, vatRegistered)).subtotal, 0);

  const used = new Map<string, number>();
  for (const c of [...creditNotes].sort((a, b) => a.date.localeCompare(b.date))) {
    const inv = byId.get(c.invoiceId);
    if (!inv) continue;
    const charge = invoiceCharge(inv, invoiceVat(inv, vatRegistered));
    const already = used.get(inv.id) ?? 0;
    const share = Math.max(0, Math.min(charge.total > 0 ? c.amount / charge.total : 1, 1 - already));
    used.set(inv.id, already + share);
    if (inPeriod(c.date)) income -= charge.subtotal * share;
  }
  return income;
}
