import type { CreditNote, Invoice, Receipt } from "@/lib/storage";
import { computeInvoiceTotals } from "@/lib/vat";

// England, Wales and Northern Ireland, 2026/27 (frozen at these figures
// until 2030/31). Scotland sets its own income tax bands.
const PERSONAL_ALLOWANCE = 12_570;
const TAPER_FROM = 100_000;
const BASIC_BAND = 37_700;
const ADDITIONAL_FROM = 125_140;
const CLASS4_LOWER = 12_570;
const CLASS4_UPPER = 50_270;

export type TaxYear = { label: string; start: string; end: string };

// A tax year runs 6 April to 5 April.
export function taxYearOf(iso: string): TaxYear {
  const year = Number(iso.slice(0, 4));
  const first = iso.slice(5) >= "04-06" ? year : year - 1;
  return { label: `${first}/${String(first + 1).slice(2)}`, start: `${first}-04-06`, end: `${first + 1}-04-05` };
}

export function incomeTax(profit: number): number {
  if (profit <= 0) return 0;
  const allowance = Math.max(0, PERSONAL_ALLOWANCE - Math.max(0, profit - TAPER_FROM) / 2);
  const taxable = Math.max(0, profit - allowance);
  const basic = Math.min(taxable, BASIC_BAND);
  const higher = Math.max(0, Math.min(taxable, ADDITIONAL_FROM - allowance) - BASIC_BAND);
  const additional = Math.max(0, profit - ADDITIONAL_FROM);
  return basic * 0.2 + higher * 0.4 + additional * 0.45;
}

export function class4(profit: number): number {
  const main = Math.max(0, Math.min(profit, CLASS4_UPPER) - CLASS4_LOWER);
  const upper = Math.max(0, profit - CLASS4_UPPER);
  return main * 0.06 + upper * 0.02;
}

export type TaxEstimate = {
  year: TaxYear;
  through: string;
  income: number;
  expenses: number;
  profit: number;
  incomeTax: number;
  class4: number;
  total: number;
  // What the whole year comes to if it carries on at this rate; null in
  // the first month, when a projection would be noise.
  projected: { profit: number; total: number } | null;
  vatOwed: number | null;
  invoicesCounted: number;
  receiptsCounted: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

// Tax on the year's profit so far, as if the year ended today: sales
// invoices issued this tax year (not drafts) less their credit notes, minus
// every checked receipt. Invoices count when issued, not when paid.
export function estimateTax({ invoices, creditNotes, receipts, vatRegistered, today }: {
  invoices: Invoice[];
  creditNotes: CreditNote[];
  receipts: Receipt[];
  vatRegistered: boolean;
  today: string;
}): TaxEstimate {
  const year = taxYearOf(today);
  const inYear = (d: string) => d >= year.start && d <= today;

  let income = 0;
  let vatCharged = 0;
  let invoicesCounted = 0;
  const byId = new Map(invoices.map((inv) => [inv.id, inv]));
  for (const inv of invoices) {
    if (inv.status === "draft" || !inYear(inv.date)) continue;
    const t = computeInvoiceTotals(inv.items, vatRegistered);
    income += t.subtotal;
    vatCharged += t.totalVat;
    invoicesCounted++;
  }
  // Credit notes hold the gross amount; split it in the invoice's own
  // net/VAT proportion.
  for (const c of creditNotes) {
    const inv = byId.get(c.invoiceId);
    if (!inv || inv.status === "draft" || !inYear(c.date)) continue;
    const t = computeInvoiceTotals(inv.items, vatRegistered);
    const netShare = t.total > 0 ? t.subtotal / t.total : 1;
    income -= c.amount * netShare;
    vatCharged -= c.amount * (1 - netShare);
  }

  // Without VAT registration the VAT on a cost can't be reclaimed, so it is
  // part of the cost.
  let expenses = 0;
  let vatPaid = 0;
  let receiptsCounted = 0;
  for (const r of receipts) {
    if (r.needsReview || !inYear(r.date)) continue;
    expenses += vatRegistered ? r.amount : r.amount + r.vatAmount;
    vatPaid += r.vatAmount;
    receiptsCounted++;
  }

  const profit = income - expenses;
  const it = incomeTax(profit);
  const ni = class4(profit);
  const days = Math.round((Date.parse(today) - Date.parse(year.start)) / 86_400_000) + 1;
  const yearDays = Math.round((Date.parse(year.end) - Date.parse(year.start)) / 86_400_000) + 1;
  const projectedProfit = days >= 30 ? (profit * yearDays) / days : null;

  return {
    year,
    through: today,
    income: round(income),
    expenses: round(expenses),
    profit: round(profit),
    incomeTax: round(it),
    class4: round(ni),
    total: round(it + ni),
    projected: projectedProfit === null ? null : { profit: round(projectedProfit), total: round(incomeTax(projectedProfit) + class4(projectedProfit)) },
    vatOwed: vatRegistered ? round(vatCharged - vatPaid) : null,
    invoicesCounted,
    receiptsCounted,
  };
}
