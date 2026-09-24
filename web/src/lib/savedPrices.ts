import type { Invoice, Quote } from "@/lib/storage";
import type { VatRateKind } from "@/lib/vat";

// The things you charge for, learned from what you have already invoiced
// and quoted, so a price list is never typed out. Atanas does the same
// handful of jobs at the same handful of prices; asking him to enter them
// twice is asking him not to bother.
//
// The invoice form already suggested lines used before FOR THIS CUSTOMER.
// That only helps on the second invoice to the same person, which is not
// where the time goes: the first invoice to a new customer is for the same
// work as the last one to somebody else.

export type SavedPrice = {
  description: string;
  // The price last charged, which is the one to offer: an old price that
  // has since gone up is worse than no suggestion at all.
  unitPrice: number;
  vatRate: VatRateKind;
  timesUsed: number;
  lastUsed: string;
};

// Same job written two ways is the same job. Case and the spaces around it
// are noise; anything else is a different line and stays one.
const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function savedPrices(invoices: Invoice[], quotes: Quote[] = [], limit = 12): SavedPrice[] {
  const found = new Map<string, SavedPrice>();
  // The PRICE to offer is the last one charged. The WORDING is not: a line
  // typed once in a hurry, all in lower case, would otherwise be the version
  // printed on a customer's invoice for ever after. So the spelling used
  // most often wins, and the most recent of those breaks a tie.
  const spellings = new Map<string, Map<string, { count: number; last: string }>>();

  const take = (description: string, unitPrice: number, vatRate: VatRateKind, quantity: number, date: string) => {
    // A deduction (a deposit taken off a final invoice) is not something to
    // bill again, and neither is a blank line somebody left behind.
    if (!description.trim() || quantity < 0 || !(unitPrice > 0)) return;
    const k = key(description);
    const written = description.trim();
    const seen = spellings.get(k) ?? new Map<string, { count: number; last: string }>();
    const was = seen.get(written);
    seen.set(written, { count: (was?.count ?? 0) + 1, last: was && was.last > date ? was.last : date });
    spellings.set(k, seen);

    const had = found.get(k);
    if (!had) {
      found.set(k, { description: written, unitPrice, vatRate, timesUsed: 1, lastUsed: date });
      return;
    }
    had.timesUsed += 1;
    if (date >= had.lastUsed) {
      had.lastUsed = date;
      had.unitPrice = unitPrice;
      had.vatRate = vatRate;
    }
  };

  for (const inv of invoices) {
    // A draft was never sent to anybody, so its prices are not yet a price.
    if (inv.status === "draft") continue;
    for (const item of inv.items) take(item.description, item.unitPrice, item.vatRate, item.quantity, inv.date);
  }
  for (const q of quotes) {
    if (q.status === "draft") continue;
    for (const item of q.items) take(item.description, item.unitPrice, item.vatRate, item.quantity, q.date);
  }

  for (const [k, row] of found) {
    const best = [...(spellings.get(k) ?? new Map())].sort((a, b) => b[1].count - a[1].count || b[1].last.localeCompare(a[1].last))[0];
    if (best) row.description = best[0];
  }

  // Most used first, and the most recent of those first: what you charge
  // for most often is what you are most likely to be charging for now.
  return [...found.values()]
    .sort((a, b) => b.timesUsed - a.timesUsed || b.lastUsed.localeCompare(a.lastUsed) || a.description.localeCompare(b.description))
    .slice(0, limit);
}

// What to offer on a form: what this customer has been charged before comes
// first, since it is the better guess, then everything else you charge for.
export function pricesFor(all: SavedPrice[], forCustomer: SavedPrice[], limit = 12): SavedPrice[] {
  const seen = new Set(forCustomer.map((p) => key(p.description)));
  return [...forCustomer, ...all.filter((p) => !seen.has(key(p.description)))].slice(0, limit);
}
