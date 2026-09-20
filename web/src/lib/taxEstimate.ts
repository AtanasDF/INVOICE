import type { CreditNote, Invoice, Receipt } from "@/lib/storage";
import { invoiceVat } from "@/lib/invoiceBalance";
import { invoiceCharge } from "@/lib/cis";

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

const yearLabel = (first: number) => `${first}/${String(first + 1).slice(2)}`;

// Self Assessment is paid on 31 January (what's still owed for the tax year
// that ended the April before, with that year's return, and the first
// payment on account towards the current year) and 31 July (the second
// payment on account). Payments on account apply only to people whose last
// bill was over £1,000 and not mostly taken at source.
export function nextSelfAssessmentDate(today: string): { date: string; what: string } {
  const y = Number(today.slice(0, 4));
  const md = today.slice(5);
  const january = (y2: number) => ({
    date: `${y2}-01-31`,
    what: `your ${yearLabel(y2 - 2)} return and any tax still owed for it, plus the first payment on account towards ${yearLabel(y2 - 1)} if you make them`,
  });
  if (md <= "01-31") return january(y);
  if (md <= "07-31") return { date: `${y}-07-31`, what: `the second payment on account towards ${yearLabel(y - 1)}, if you make them` };
  return january(y + 1);
}

// Fourteen days before each payment date, the daily notification says so
// to everyone with notifications on.
export const SA_NOTICE_DAYS = 14;
export function selfAssessmentNotice(today: string): string | null {
  const next = nextSelfAssessmentDate(today);
  if (Math.round((Date.parse(next.date) - Date.parse(today)) / 86_400_000) !== SA_NOTICE_DAYS) return null;
  return `Self Assessment is due ${next.date.endsWith("-01-31") ? "31 January" : "31 July"}: ${next.what}`;
}

// When a tax year's bill is finally due: 31 January after it ends.
export function yearBillDue(year: TaxYear): string {
  return `${Number(year.start.slice(0, 4)) + 2}-01-31`;
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
  // CIS contractors keep back from this year's invoices: tax already paid,
  // so it comes off what's left to pay. setAside below zero is a refund.
  cisDeducted: number;
  setAside: number;
  // What the whole year comes to if it carries on at this rate; null in
  // the first month, when a projection would be noise.
  projected: { profit: number; total: number; setAside: number } | null;
  // True for the first 30 days of a tax year, when annualising a few days'
  // work makes the tax figures meaningless. They are still returned, so
  // nothing has to handle nulls, but nothing should show them as an amount
  // to put by.
  tooEarly: boolean;
  vatOwed: number | null;
  invoicesCounted: number;
  receiptsCounted: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

// Tax built up on the year's profit so far (see the note by `share`): sales
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
  let cisDeducted = 0;
  let invoicesCounted = 0;
  const byId = new Map(invoices.map((inv) => [inv.id, inv]));
  for (const inv of invoices) {
    if (inv.status === "draft" || !inYear(inv.date)) continue;
    // Each invoice under the VAT setting it was issued with.
    const t = invoiceCharge(inv, invoiceVat(inv, vatRegistered));
    income += t.subtotal;
    vatCharged += t.totalVat;
    cisDeducted += t.cis;
    invoicesCounted++;
  }
  // A credit note is the value of the work credited: it takes that share of
  // the invoice's net, VAT and CIS with it, and never more than the whole
  // invoice.
  const creditedShare = new Map<string, number>();
  for (const c of creditNotes) {
    const inv = byId.get(c.invoiceId);
    if (!inv || inv.status === "draft" || !inYear(c.date)) continue;
    const t = invoiceCharge(inv, invoiceVat(inv, vatRegistered));
    const used = creditedShare.get(inv.id) ?? 0;
    const share = Math.max(0, Math.min(t.total > 0 ? c.amount / t.total : 1, 1 - used));
    creditedShare.set(inv.id, used + share);
    income -= t.subtotal * share;
    vatCharged -= t.totalVat * share;
    if (inYear(inv.date)) cisDeducted -= t.cis * share;
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
  const days = Math.round((Date.parse(today) - Date.parse(year.start)) / 86_400_000) + 1;
  const yearDays = Math.round((Date.parse(year.end) - Date.parse(year.start)) / 86_400_000) + 1;
  // The year's allowances and bands belong to the whole year: tax on the
  // profit so far with all of them would understate what's building up,
  // and CIS (kept back from the first pound) would look like a refund. So
  // it's the share of the whole year's tax built up so far, the year taken
  // to carry on at this rate -- from the first day, so the figure doesn't
  // jump when the projection line appears after a month.
  const share = days / yearDays;
  const yearProfit = profit / share;
  const yearTax = incomeTax(yearProfit) + class4(yearProfit);
  const it = incomeTax(yearProfit) * share;
  const ni = class4(yearProfit) * share;
  const projectedProfit = days >= 30 ? yearProfit : null;
  // The same reason the projection waits a month applies to the headline.
  // Dividing by a share of a few days explodes: one £5,000 invoice on
  // 6 April annualises to £1.8m and asks him to set aside £2,316, when the
  // real tax on £5,000 of annual profit is nothing at all. The figure then
  // falls all year with no change in the underlying work. Better to say it
  // is too early than to have him hold back money he doesn't owe in the
  // month a new business can least afford it.
  const tooEarly = days < 30;

  return {
    year,
    through: today,
    income: round(income),
    expenses: round(expenses),
    profit: round(profit),
    incomeTax: round(it),
    class4: round(ni),
    total: round(it + ni),
    cisDeducted: round(cisDeducted),
    setAside: round(it + ni - cisDeducted),
    projected:
      projectedProfit === null
        ? null
        : { profit: round(projectedProfit), total: round(yearTax), setAside: round(yearTax - cisDeducted / share) },
    tooEarly,
    vatOwed: vatRegistered ? round(vatCharged - vatPaid) : null,
    invoicesCounted,
    receiptsCounted,
  };
}
