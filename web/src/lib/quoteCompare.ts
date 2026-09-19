// Comparing suppliers' prices for a quote request: per line, per supplier,
// the best single supplier and the best split once delivery is counted.
// Everything is compared ex VAT; a supplier who quoted VAT-inclusive prices
// is converted at the standard rate. Money is worked in pence.

export type RequestItem = { id: string; description: string; quantity: number; unit: string; note: string };
export type LinePrice = { price: number | null; unavailable: boolean; note: string };

// One supplier's answer, as the comparison needs it.
export type Offer = {
  id: string;
  name: string;
  prices: Record<string, LinePrice>;
  delivery: number | null;
  vatIncluded: boolean;
  validUntil: string | null;
};

export type Picks = Record<string, string | null>;

export const VAT_RATE = 0.2;
// 2^n supplier sets are tried for the best split; past this many offers the
// cheapest-looking ones are kept.
const MAX_SPLIT_OFFERS = 12;

const pence = (n: number) => Math.round(n * 100);

export type Cell =
  | { kind: "price"; unit: number; ex: number; inc: number; note: string }
  | { kind: "unavailable"; note: string }
  | { kind: "missing" };

// What a supplier's answer says for one line: the price for the whole
// quantity in pence, ex and inc VAT; "can't supply"; or nothing at all.
export function cellFor(offer: Offer, item: RequestItem): Cell {
  const p = offer.prices[item.id];
  if (!p) return { kind: "missing" };
  if (p.unavailable) return { kind: "unavailable", note: p.note };
  if (p.price === null || !Number.isFinite(p.price) || p.price < 0) return { kind: "missing" };
  const gross = p.price * item.quantity;
  return offer.vatIncluded
    ? { kind: "price", unit: p.price, ex: pence(gross / (1 + VAT_RATE)), inc: pence(gross), note: p.note }
    : { kind: "price", unit: p.price, ex: pence(gross), inc: pence(gross * (1 + VAT_RATE)), note: p.note };
}

export function deliveryOf(offer: Offer): { ex: number; inc: number } {
  const d = offer.delivery ?? 0;
  return offer.vatIncluded ? { ex: pence(d / (1 + VAT_RATE)), inc: pence(d) } : { ex: pence(d), inc: pence(d * (1 + VAT_RATE)) };
}

export const isExpired = (offer: Offer, today: string) => !!offer.validUntil && offer.validUntil < today;

export type SupplierTotal = { id: string; priced: number; unavailable: number; missing: number; linesEx: number; linesInc: number; deliveryEx: number; deliveryInc: number; ex: number; inc: number };

// A supplier's column: what the lines they priced come to, plus delivery.
export function supplierTotal(offer: Offer, items: RequestItem[]): SupplierTotal {
  const t = { id: offer.id, priced: 0, unavailable: 0, missing: 0, linesEx: 0, linesInc: 0 };
  for (const item of items) {
    const c = cellFor(offer, item);
    if (c.kind === "price") {
      t.priced++;
      t.linesEx += c.ex;
      t.linesInc += c.inc;
    } else if (c.kind === "unavailable") t.unavailable++;
    else t.missing++;
  }
  const d = deliveryOf(offer);
  return { ...t, deliveryEx: d.ex, deliveryInc: d.inc, ex: t.linesEx + d.ex, inc: t.linesInc + d.inc };
}

// The offers priced lowest for a line (all of them on a tie).
export function cheapestFor(offers: Offer[], item: RequestItem): string[] {
  let best = Infinity;
  let ids: string[] = [];
  for (const o of offers) {
    const c = cellFor(o, item);
    if (c.kind !== "price") continue;
    if (c.ex < best) {
      best = c.ex;
      ids = [o.id];
    } else if (c.ex === best) ids.push(o.id);
  }
  return ids;
}

export type Order = { offer: Offer; items: RequestItem[]; linesEx: number; linesInc: number; deliveryEx: number; deliveryInc: number; ex: number; inc: number };
export type Plan = { picks: Picks; orders: Order[]; ex: number; inc: number; deliveryEx: number; unpicked: RequestItem[] };

// What a set of picks costs: each supplier used is paid its delivery once.
// A pick that points at a supplier with no price for the line is dropped.
export function planFor(offers: Offer[], items: RequestItem[], picks: Picks): Plan {
  const byId = new Map(offers.map((o) => [o.id, o]));
  const orders = new Map<string, Order>();
  const unpicked: RequestItem[] = [];
  const clean: Picks = {};
  for (const item of items) {
    const offer = picks[item.id] ? byId.get(picks[item.id]!) : undefined;
    const c = offer ? cellFor(offer, item) : null;
    if (!offer || c?.kind !== "price") {
      unpicked.push(item);
      clean[item.id] = null;
      continue;
    }
    clean[item.id] = offer.id;
    let order = orders.get(offer.id);
    if (!order) {
      const d = deliveryOf(offer);
      order = { offer, items: [], linesEx: 0, linesInc: 0, deliveryEx: d.ex, deliveryInc: d.inc, ex: 0, inc: 0 };
      orders.set(offer.id, order);
    }
    order.items.push(item);
    order.linesEx += c.ex;
    order.linesInc += c.inc;
  }
  const list = offers.map((o) => orders.get(o.id)).filter((o): o is Order => !!o);
  for (const o of list) {
    o.ex = o.linesEx + o.deliveryEx;
    o.inc = o.linesInc + o.deliveryInc;
  }
  return {
    picks: clean,
    orders: list,
    ex: list.reduce((s, o) => s + o.ex, 0),
    inc: list.reduce((s, o) => s + o.inc, 0),
    deliveryEx: list.reduce((s, o) => s + o.deliveryEx, 0),
    unpicked,
  };
}

export type Comparison = {
  // Offers the automatic picks may use: not past their valid-until date.
  eligible: Offer[];
  // Lines no eligible supplier priced.
  uncovered: RequestItem[];
  single: Plan | null;
  split: Plan | null;
  // The split is recommended only when it costs less than the best single
  // supplier after every delivery charge (or no one supplier has it all).
  recommended: Plan | null;
  splitSaves: number;
};

export function compare(offers: Offer[], items: RequestItem[], today: string): Comparison {
  const eligible = offers.filter((o) => !isExpired(o, today) && items.some((i) => cellFor(o, i).kind === "price"));
  const covered = items.filter((i) => eligible.some((o) => cellFor(o, i).kind === "price"));
  const uncovered = items.filter((i) => !covered.includes(i));
  if (!covered.length) return { eligible, uncovered, single: null, split: null, recommended: null, splitSaves: 0 };

  let single: Plan | null = null;
  for (const o of eligible) {
    if (!covered.every((i) => cellFor(o, i).kind === "price")) continue;
    const plan = planFor(offers, items, Object.fromEntries(covered.map((i) => [i.id, o.id])));
    if (!single || plan.ex < single.ex) single = plan;
  }

  const pool = eligible.length <= MAX_SPLIT_OFFERS ? eligible : [...eligible].sort((a, b) => supplierTotal(a, covered).ex - supplierTotal(b, covered).ex).slice(0, MAX_SPLIT_OFFERS);
  const costs = pool.map((o) => covered.map((i) => {
    const c = cellFor(o, i);
    return c.kind === "price" ? c.ex : Infinity;
  }));
  const deliveries = pool.map((o) => deliveryOf(o).ex);
  let best: { cost: number; used: number; mask: number } | null = null;
  for (let mask = 1; mask < 1 << pool.length; mask++) {
    let cost = 0;
    for (let s = 0; s < pool.length; s++) if (mask & (1 << s)) cost += deliveries[s];
    for (let i = 0; i < covered.length && cost < Infinity; i++) {
      let line = Infinity;
      for (let s = 0; s < pool.length; s++) if (mask & (1 << s) && costs[s][i] < line) line = costs[s][i];
      cost += line;
    }
    if (cost === Infinity) continue;
    const used = bitCount(mask);
    if (!best || cost < best.cost || (cost === best.cost && used < best.used)) best = { cost, used, mask };
  }
  let split: Plan | null = null;
  if (best) {
    const picks: Picks = {};
    covered.forEach((item, i) => {
      let at = -1;
      for (let s = 0; s < pool.length; s++) if (best.mask & (1 << s) && (at < 0 || costs[s][i] < costs[at][i])) at = s;
      picks[item.id] = pool[at].id;
    });
    split = planFor(offers, items, picks);
  }

  const splitSaves = single && split ? single.ex - split.ex : 0;
  const recommended = split && (!single || splitSaves > 0) ? split : single;
  return { eligible, uncovered, single, split, recommended, splitSaves: Math.max(0, splitSaves) };
}

function bitCount(n: number) {
  let c = 0;
  for (; n; n &= n - 1) c++;
  return c;
}

export const formatPence = (p: number) => `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const formatPounds = (n: number) => formatPence(pence(n));

const qty = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));
export const quantityText = (item: Pick<RequestItem, "quantity" | "unit">) => `${qty(item.quantity)}${item.unit ? ` ${item.unit}` : ""}`;

// The order to place with one supplier, in their own terms (their prices as
// they quoted them, VAT included or not), ready to paste into a message.
export function orderText(order: Order, ctx: { title: string; from: string; siteAddress: string; neededBy: string | null; longDate: (iso: string) => string }): string {
  const o = order.offer;
  const vat = o.vatIncluded ? "inc VAT" : "ex VAT";
  const lines = order.items.map((item) => {
    const c = cellFor(o, item);
    if (c.kind !== "price") return "";
    const line = `${quantityText(item)} × ${item.description} @ ${formatPounds(c.unit)} = ${formatPence(o.vatIncluded ? c.inc : c.ex)}`;
    return c.note ? `${line} (${c.note})` : line;
  });
  return [
    `Order: ${ctx.title}`,
    ...(ctx.from ? [`From: ${ctx.from}`] : []),
    "",
    ...lines,
    ...(o.delivery ? [`Delivery: ${formatPounds(o.delivery)}`] : []),
    `Total: ${formatPence(o.vatIncluded ? order.inc : order.ex)} ${vat}`,
    "",
    `As per your quote${o.validUntil ? `, valid until ${ctx.longDate(o.validUntil)}` : ""}.`,
    ...(ctx.siteAddress ? [`Deliver to: ${ctx.siteAddress.replace(/\s*\n\s*/g, ", ")}`] : []),
    ...(ctx.neededBy ? [`Needed by: ${ctx.longDate(ctx.neededBy)}`] : []),
  ].join("\n");
}

// Lines read off a supplier's own quote, matched to the requested items by
// the words they share; each scanned line is used at most once. The owner
// confirms or changes every match before anything is saved.
export type ScannedLine = { description: string; quantity: number; unitPrice: number; lineTotal: number | null };

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/(\d)\s*(mm|cm|m|kg|g|l|ltr|litre|litres)\b/g, "$1$2")
      .split(/[^a-z0-9.]+/)
      .map((w) => w.replace(/^\.+|\.+$/g, ""))
      .filter((w) => w && !STOP.has(w))
  );
const STOP = new Set(["a", "an", "the", "of", "and", "for", "with", "x", "per", "each", "ea", "no", "pcs", "pc", "qty"]);

export function similarity(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  let sharedNumbers = 0;
  for (const w of A) if (B.has(w)) {
    shared++;
    if (/\d/.test(w)) sharedNumbers++;
  }
  // Sizes and codes ("100mm", "3.6m") say more than words like "timber".
  return (shared + sharedNumbers * 0.5) / (A.size + B.size - shared);
}

export function matchScannedLines(items: RequestItem[], scanned: ScannedLine[], threshold = 0.2): (number | null)[] {
  const pairs: { i: number; s: number; score: number }[] = [];
  items.forEach((item, i) => scanned.forEach((line, s) => {
    const score = similarity(item.description, line.description);
    if (score >= threshold) pairs.push({ i, s, score });
  }));
  pairs.sort((a, b) => b.score - a.score || a.i - b.i || a.s - b.s);
  const out: (number | null)[] = items.map(() => null);
  const used = new Set<number>();
  for (const p of pairs) {
    if (out[p.i] !== null || used.has(p.s)) continue;
    out[p.i] = p.s;
    used.add(p.s);
  }
  return out;
}

export const isDeliveryLine = (description: string) => /\b(deliver(y|ies)?|carriage|haulage|transport|shipping|postage|courier)\b/i.test(description);

// A scanned line's price per unit: the printed unit price, or the line total
// shared over its quantity when no unit price was read.
export function scannedUnitPrice(line: ScannedLine): number | null {
  if (line.unitPrice > 0) return line.unitPrice;
  if (line.lineTotal !== null && line.lineTotal > 0 && line.quantity > 0) return Math.round((line.lineTotal / line.quantity) * 10000) / 10000;
  return line.unitPrice === 0 && line.lineTotal === 0 ? 0 : null;
}
