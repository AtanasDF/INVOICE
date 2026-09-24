import type { CreditNote, Invoice, InvoicePayment, Receipt } from "@/lib/storage";
import { invoiceCharge, creditOffDue } from "@/lib/cis";
import { invoiceVat } from "@/lib/invoiceBalance";

// A job: everything about one piece of work in one place -- what was
// quoted, what was invoiced, what it cost, and what is left over.
//
// No new table. Invoices and receipts already carry tags, and a job IS a
// tag: put "Willow Road" on the invoices and the receipts for that job and
// they gather here. That also means a job can be started after the fact,
// which is how it will actually happen -- nobody decides something is a
// "job" until the second invoice for it.
//
// The tags the app writes itself are not jobs: "from Q-0001" and "deposit
// for Q-0001" tie a quote to its invoices and would otherwise turn every
// quote into a one-line job nobody made.
const OWN_TAG = /^(from|deposit for) /i;

export const isJobTag = (tag: string) => !!tag.trim() && !OWN_TAG.test(tag.trim());

export type Job = {
  name: string;
  invoices: Invoice[];
  receipts: Receipt[];
  // Everything invoiced on this job, including VAT.
  invoiced: number;
  // What has actually come in against those invoices.
  received: number;
  // What is still owed on them.
  owed: number;
  // What the job cost: every expense tagged with it, including VAT,
  // because that is the money that left the account.
  spent: number;
  // Invoiced less spent. Not profit in an accountant's sense -- no labour
  // of your own, no overheads -- so it is called what it is.
  left: number;
  lastActivity: string;
};

export function jobs(
  invoices: Invoice[],
  receipts: Receipt[],
  creditNotes: CreditNote[],
  payments: InvoicePayment[],
  accountVat: boolean
): Job[] {
  const names = new Set<string>();
  for (const inv of invoices) for (const t of inv.tags ?? []) if (isJobTag(t)) names.add(t.trim());
  for (const r of receipts) for (const t of r.tags ?? []) if (isJobTag(t)) names.add(t.trim());

  const creditBy = new Map<string, number>();
  for (const c of creditNotes) creditBy.set(c.invoiceId, (creditBy.get(c.invoiceId) ?? 0) + c.amount);
  const paidBy = new Map<string, number>();
  for (const p of payments) paidBy.set(p.invoiceId, (paidBy.get(p.invoiceId) ?? 0) + p.amount);

  const round = (n: number) => Math.round(n * 100) / 100;

  return [...names]
    .map((name): Job => {
      const has = (tags: string[] | null | undefined) => (tags ?? []).some((t) => t.trim() === name);
      const mine = invoices.filter((i) => has(i.tags) && i.status !== "draft");
      const theirs = receipts.filter((r) => has(r.tags));

      let invoiced = 0;
      let owed = 0;
      let received = 0;
      for (const inv of mine) {
        const charge = invoiceCharge(inv, invoiceVat(inv, accountVat));
        const paid = paidBy.get(inv.id) ?? 0;
        const credited = creditOffDue(charge, creditBy.get(inv.id) ?? 0);
        invoiced += charge.due - credited;
        received += paid;
        owed += Math.max(0, charge.due - credited - paid);
      }
      // A credit note is negative in the receipts table, so money refunded
      // by a supplier comes off what the job cost without a special case.
      const spent = theirs.reduce((s, r) => s + r.amount + r.vatAmount, 0);
      const dates = [...mine.map((i) => i.date), ...theirs.map((r) => r.date)].sort();

      return {
        name,
        invoices: mine,
        receipts: theirs,
        invoiced: round(invoiced),
        received: round(received),
        owed: round(owed),
        spent: round(spent),
        left: round(invoiced - spent),
        lastActivity: dates[dates.length - 1] ?? "",
      };
    })
    // The one worked on most recently first: that is the one being asked
    // about.
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity) || a.name.localeCompare(b.name));
}
