import { invoiceVat } from "@/lib/invoiceBalance";
import { computeInvoiceTotals } from "@/lib/vat";
import type { CreditNote, Invoice, InvoicePayment, Receipt } from "@/lib/storage";

// The figures a VAT return asks for, worked out from the invoices and
// receipts already in the app. It is a summary to check and copy into
// HMRC's form, not a filing: nothing is sent anywhere.

export type VatBasis = "invoice" | "cash";

export type VatFigures = {
  // Box 1: VAT charged on sales. Box 4: VAT paid on purchases.
  box1: number;
  box4: number;
  // Box 5: the difference, what's owed (or reclaimable when negative).
  box5: number;
  // Box 6: sales ex VAT. Box 7: purchases ex VAT.
  box6: number;
  box7: number;
  sales: { id: string; date: string; number: string; net: number; vat: number }[];
  purchases: { id: string; date: string; vendor: string; net: number; vat: number }[];
};

const pence = (n: number) => Math.round(n * 100);
const round = (p: number) => p / 100;
const inRange = (date: string, from: string, to: string) => date >= from && date <= to;

// Quarters run from the start of the month a period begins in; most small
// businesses are on calendar quarters, so that's the default offered.
export function quarterOf(dateIso: string): { from: string; to: string } {
  const [y, m] = dateIso.split("-").map(Number);
  const startMonth = Math.floor((m - 1) / 3) * 3 + 1;
  const from = `${y}-${String(startMonth).padStart(2, "0")}-01`;
  const endMonth = startMonth + 2;
  const last = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
  return { from, to: `${y}-${String(endMonth).padStart(2, "0")}-${String(last).padStart(2, "0")}` };
}

export function previousQuarter(dateIso: string): { from: string; to: string } {
  const { from } = quarterOf(dateIso);
  const [y, m] = from.split("-").map(Number);
  const back = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  return quarterOf(back);
}

export function quarterLabel(from: string, to: string): string {
  const month = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  return `${month(from)} – ${month(to)}`;
}

export function vatFigures(
  invoices: Invoice[],
  creditNotes: CreditNote[],
  payments: InvoicePayment[],
  receipts: Receipt[],
  accountVat: boolean,
  period: { from: string; to: string },
  basis: VatBasis
): VatFigures {
  const sales: VatFigures["sales"] = [];
  let box1 = 0;
  let box6 = 0;

  for (const inv of invoices) {
    if (inv.status === "draft") continue;
    const totals = computeInvoiceTotals(inv.items, invoiceVat(inv, accountVat));
    if (totals.total <= 0) continue;
    const vatShare = totals.totalVat / totals.total;
    const paidIn = payments.filter((p) => p.invoiceId === inv.id && inRange(p.date, period.from, period.to)).reduce((s, p) => s + p.amount, 0);
    // On the invoice basis the whole invoice counts in the period it was
    // issued; on the cash basis only the money that actually moved, split
    // into net and VAT in the same proportion as the invoice.
    const gross = basis === "invoice" ? (inRange(inv.date, period.from, period.to) ? totals.total : 0) : paidIn;
    if (gross <= 0) continue;
    const vat = round(Math.round(pence(gross) * vatShare));
    const net = round(pence(gross) - pence(vat));
    box1 += pence(vat);
    box6 += pence(net);
    sales.push({ id: inv.id, date: basis === "invoice" ? inv.date : period.to, number: inv.number, net, vat });
  }

  // A credit note takes sales and their VAT back out, in the period it was
  // raised (both bases: the money is returned or never comes).
  for (const note of creditNotes) {
    if (!inRange(note.date, period.from, period.to)) continue;
    const inv = invoices.find((i) => i.id === note.invoiceId);
    if (!inv) continue;
    const totals = computeInvoiceTotals(inv.items, invoiceVat(inv, accountVat));
    if (totals.total <= 0) continue;
    const vat = round(Math.round(pence(note.amount) * (totals.totalVat / totals.total)));
    const net = round(pence(note.amount) - pence(vat));
    box1 -= pence(vat);
    box6 -= pence(net);
    sales.push({ id: note.id, date: note.date, number: `Credit against ${inv.number}`, net: -net, vat: -vat });
  }

  const purchases: VatFigures["purchases"] = [];
  let box4 = 0;
  let box7 = 0;
  for (const r of receipts) {
    if (r.needsReview) continue;
    if (!inRange(r.date, period.from, period.to)) continue;
    // receipts.amount is already net of VAT, and a credit note is stored
    // negative, so both add up without special cases.
    box4 += pence(r.vatAmount);
    box7 += pence(r.amount);
    if (r.vatAmount || r.amount) purchases.push({ id: r.id, date: r.date, vendor: r.vendor || r.category, net: r.amount, vat: r.vatAmount });
  }

  return {
    box1: round(box1),
    box4: round(box4),
    box5: round(box1 - box4),
    box6: round(box6),
    box7: round(box7),
    sales: sales.sort((a, b) => (a.date < b.date ? -1 : 1)),
    purchases: purchases.sort((a, b) => (a.date < b.date ? -1 : 1)),
  };
}
