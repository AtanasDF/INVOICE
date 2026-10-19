// The Mon-Sun week a day falls in, as two date strings. UTC throughout, on a
// date string: local midnight converted back through toISOString shifts the
// day whenever the viewer's offset isn't zero.
//
// Clearing the date box leaves "", and new Date("").toISOString() throws a
// RangeError -- during render, so the whole Expenses page fell to the error
// screen. A box with no usable day shows the week we are in.
export function weekOf(day: string, today: string): { start: string; end: string } {
  const at = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(at(day).getTime()) ? at(day) : at(today);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1) - dow);
  const start = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  return { start, end: d.toISOString().slice(0, 10) };
}

type SplitReceipt = {
  amount: number;
  vatAmount: number;
  category: string;
  lineItems: { quantity: number; unitPrice: number; category?: string | null }[];
};

// Whole pennies shared out by weight, the leftovers going to the largest
// remainders, so the parts always add back to the whole.
function sharePennies(pennies: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  const sign = pennies < 0 ? -1 : 1;
  const whole = Math.abs(pennies);
  const exact = weights.map((w) => (whole * w) / sum);
  const out = exact.map(Math.floor);
  let left = whole - out.reduce((s, n) => s + n, 0);
  const order = exact.map((e, i) => [e - Math.floor(e), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k++, left--) out[order[k % order.length][1]] += 1;
  return out.map((n) => sign * n);
}

// Spending per category, a receipt with lines split across its lines'
// categories in proportion to their prices. The split used to be in floats
// rounded only for display, so a £10.00 receipt with three equal lines in
// three categories showed £3.33 three times beside a £10.00 total. Each
// receipt is now shared out in whole pennies that add back to exactly its
// own amount and VAT.
export function spendByCategory(receipts: SplitReceipt[]): [string, { total: number; vat: number }][] {
  const map = new Map<string, { total: number; vat: number }>();
  const add = (cat: string, totalP: number, vatP: number) => {
    const e = map.get(cat) ?? { total: 0, vat: 0 };
    map.set(cat, { total: e.total + totalP, vat: e.vat + vatP });
  };
  for (const r of receipts) {
    const amountP = Math.round(r.amount * 100);
    const vatP = Math.round(r.vatAmount * 100);
    const byCat = new Map<string, number>();
    for (const li of r.lineItems) {
      const cat = li.category || r.category;
      byCat.set(cat, (byCat.get(cat) ?? 0) + li.quantity * li.unitPrice);
    }
    const itemsTotal = [...byCat.values()].reduce((s, n) => s + n, 0);
    if (r.lineItems.length === 0 || itemsTotal <= 0 || [...byCat.values()].some((n) => n < 0)) {
      add(r.category, amountP, vatP);
      continue;
    }
    const cats = [...byCat.keys()];
    const weights = [...byCat.values()];
    const totals = sharePennies(amountP, weights);
    const vats = sharePennies(vatP, weights);
    cats.forEach((cat, i) => add(cat, totals[i], vats[i]));
  }
  return [...map.entries()]
    .map(([cat, v]): [string, { total: number; vat: number }] => [cat, { total: v.total / 100, vat: v.vat / 100 }])
    .sort((a, b) => b[1].total - a[1].total);
}
