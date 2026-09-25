import type { Invoice } from "@/lib/storage";

// "Same again": the last invoice to a customer, ready to send again.
//
// The single strongest friction-reducer found in the twelve apps
// (notes/competitor-research.md, item 1). Tide charges £5.99+VAT a month for
// it and Square paywalls it at £20; most do not have it on a phone at all.
//
// Duplicating an invoice already existed -- but only from the invoice
// itself, which means finding last month's first. For a plasterer billing
// the same contractor every month that is: Invoices, scroll, open, read the
// number to be sure it is the right one, Duplicate. This is the same thing
// from where they actually start.
//
// Only issued invoices count. A draft is not "the same again", it is
// something they never finished, and offering to copy it would multiply
// unfinished work.

export type SameAgain = {
  clientId: string;
  invoice: Invoice;
  // How many they have sent this customer, so the list can lead with the one
  // they bill most rather than the one that happens to be newest.
  sent: number;
};

// Two, not one. "Same again" is a phrase about a pattern, and a customer
// billed once is not one -- offering it there is the noise the whole idea is
// meant to avoid. The first version gated the SECTION on this and then
// listed the one-offs inside it anyway, which is the worst of both.
const A_HABIT = 2;

export function sameAgainOptions(invoices: Invoice[], limit = 3): SameAgain[] {
  const byClient = new Map<string, { invoice: Invoice; sent: number }>();
  for (const inv of invoices) {
    if (inv.status === "draft" || !inv.clientId) continue;
    const seen = byClient.get(inv.clientId);
    if (!seen) {
      byClient.set(inv.clientId, { invoice: inv, sent: 1 });
      continue;
    }
    seen.sent += 1;
    // The most recent, and on the same day the higher number: two invoices
    // dated today are ordered by which was issued second.
    if (inv.date > seen.invoice.date || (inv.date === seen.invoice.date && inv.number > seen.invoice.number)) {
      seen.invoice = inv;
    }
  }
  return [...byClient.entries()]
    .map(([clientId, { invoice, sent }]) => ({ clientId, invoice, sent }))
    .filter((o) => o.sent >= A_HABIT)
    .sort((a, b) => (b.sent - a.sent) || (a.invoice.date < b.invoice.date ? 1 : -1))
    .slice(0, limit);
}

export function worthOffering(options: SameAgain[]): boolean {
  return options.length > 0;
}
