import type { InvoiceItem } from "@/lib/storage";
import { VatLineItem, computeInvoiceTotals } from "@/lib/vat";

type CisLine = VatLineItem & { kind?: InvoiceItem["kind"] | "other" };

// Construction Industry Scheme: a contractor paying a subcontractor keeps
// back 20% of the labour (30% if the subcontractor isn't registered) and
// pays it to HMRC as tax on the subcontractor's behalf. Materials and VAT
// aren't touched.
export const CIS_RATES = [20, 30] as const;
export const CIS_RATE_LABELS: Record<number, string> = { 20: "20% (registered)", 30: "30% (not registered)" };

const pence = (n: number) => Math.round(n * 100);

// "other" is here because the Free-invoice page has a third line kind and its
// totals use the same deduction function: labourNet asks only whether a line
// IS labour, so anything else is excluded either way, and one copy of the rule
// is worth more than a narrow type.
// Lines as saved on a CIS invoice: each marked, unmarked ones as labour.
export function withKinds<T extends { kind?: "labour" | "materials" }>(items: T[], rate: number | null): T[] {
  return rate ? items.map((i) => ({ ...i, kind: i.kind ?? "labour" })) : items;
}

export function labourNet(items: CisLine[]): number {
  return pence(items.filter((i) => (i.kind ?? "labour") === "labour").reduce((s, i) => s + i.quantity * i.unitPrice, 0)) / 100;
}

// A deposit or discount taken off as labour can outweigh the labour lines;
// there's never a negative deduction.
export function cisDeduction(items: CisLine[], rate: number | null): number {
  if (!rate) return 0;
  return Math.round((pence(Math.max(0, labourNet(items))) * rate) / 100) / 100;
}

// An invoice's totals with the CIS deduction: `due` is what the customer
// pays, the total less what they keep back for HMRC. Balances, reminders
// and "owed to you" go by `due`; turnover and VAT by the totals.
export function invoiceCharge(invoice: { items: CisLine[]; cisRate: number | null }, vatRegistered: boolean) {
  const totals = computeInvoiceTotals(invoice.items, vatRegistered);
  const cis = cisDeduction(invoice.items, invoice.cisRate);
  return { ...totals, cis, due: (pence(totals.total) - pence(cis)) / 100 };
}

// A credit note is the value of the work credited, before CIS: what the
// customer pays drops by the same share of it (on a plain invoice, all of
// it). £500 credited on £1,000 of labour at 20% takes £400 off.
export function creditOffDue(charge: { total: number; due: number }, credited: number): number {
  if (charge.total <= 0 || charge.due === charge.total) return credited;
  return Math.round((pence(credited) * charge.due) / charge.total) / 100;
}

// The CIS line an invoice prints once a credit note is on it. It was the CIS
// scaled by the share still billed and rounded on its own, while the amount
// due took the credit off through creditOffDue, rounded separately: £100 with
// £10 CIS and a £4.25 credit printed -£9.57 and -£4.25 above "Amount due
// £86.17", which adds up to £86.18. Worked back from the same figures the
// amount due uses, so Total, CIS and credit notes always add up to it.
export function cisAfterCredit(charge: { total: number; due: number; cis: number }, credited: number): number {
  if (credited <= 0) return charge.cis;
  return Math.max(0, pence(charge.cis) - (pence(credited) - pence(creditOffDue(charge, credited)))) / 100;
}
