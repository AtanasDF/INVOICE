import type { Invoice, InvoiceItem, Quote } from "@/lib/storage";
import { VAT_RATE_KINDS, type VatRateKind } from "@/lib/vat";
import { priceKey, savedPrices } from "@/lib/savedPrices";

// "What I charge": the work he charges for, learned from his invoices and
// quotes, with his own changes laid over the top. Not the same thing as a
// Job (lib/jobs.ts), which is a tag gathering one piece of work's invoices
// and receipts.
//
// Only his CHANGES are stored (business_profile.price_list, migration-047),
// never the learned list itself: a stored copy of what the invoices say
// would go stale the day the next invoice is sent, and the learned figure
// has to stay visible beside his own so he can see where it came from.

export type PriceKind = "fixed" | "hourly";

export type LearnedPrice = {
  description: string;
  last: number;
  low: number;
  high: number;
  vatRate: VatRateKind;
  timesUsed: number;
  lastUsed: string;
  kind: PriceKind;
};

// One change he made. `key` ties it to a learned line (the description,
// folded the way savedPrices folds it); an item he added himself has a key
// of its own starting "own:" and no learned line behind it.
export type PriceEdit = {
  key: string;
  name?: string;
  price?: number;
  kind?: PriceKind;
  vatRate?: VatRateKind;
  hidden?: boolean;
};

export type PriceItem = {
  key: string;
  name: string;
  price: number;
  kind: PriceKind;
  vatRate: VatRateKind;
  hidden: boolean;
  learned: LearnedPrice | null;
  edited: boolean;
};

export const isOwnKey = (key: string) => key.startsWith("own:");

// Written as an hourly rate on the invoice itself: "Labour per hour",
// "Electrician (hourly)", "2 hrs callout". Anything else starts as a fixed
// price and he can switch it.
const HOURLY = /\b(per hour|an hour|hourly|hours?|hrs?|ph)\b|\/\s*hr?\b/i;

export function learnPrices(invoices: Invoice[], quotes: Quote[] = []): LearnedPrice[] {
  const ranges = new Map<string, { low: number; high: number; hourly: boolean }>();
  // The same lines savedPrices counts, and no others: a draft, a blank, a
  // deduction or something given away free is not a price.
  const take = (items: InvoiceItem[]) => {
    for (const item of items) {
      if (!item.description.trim() || item.quantity < 0 || !(item.unitPrice > 0)) continue;
      const k = priceKey(item.description);
      const r = ranges.get(k);
      const hourly = HOURLY.test(item.description);
      if (!r) ranges.set(k, { low: item.unitPrice, high: item.unitPrice, hourly });
      else ranges.set(k, { low: Math.min(r.low, item.unitPrice), high: Math.max(r.high, item.unitPrice), hourly: r.hourly || hourly });
    }
  };
  for (const inv of invoices) if (inv.status !== "draft") take(inv.items);
  for (const q of quotes) if (q.status !== "draft") take(q.items);

  return savedPrices(invoices, quotes, Infinity).map((p) => {
    const r = ranges.get(priceKey(p.description));
    return {
      description: p.description,
      last: p.unitPrice,
      low: r?.low ?? p.unitPrice,
      high: r?.high ?? p.unitPrice,
      vatRate: p.vatRate,
      timesUsed: p.timesUsed,
      lastUsed: p.lastUsed,
      kind: r?.hourly ? "hourly" : "fixed",
    };
  });
}

const money2 = (n: number) => `£${n.toFixed(2)}`;

// How the learned figure was worked out, in a line.
export function learnedWords(l: LearnedPrice): string {
  const times = l.timesUsed === 1 ? "Charged once" : `Charged ${l.timesUsed} times`;
  if (l.low === l.high) return l.timesUsed === 1 ? `${times}, at ${money2(l.last)}` : `${times}, ${money2(l.last)} every time`;
  return `${times}: ${money2(l.low)} to ${money2(l.high)}, last ${money2(l.last)}`;
}

export function buildPriceList(learned: LearnedPrice[], edits: PriceEdit[]): PriceItem[] {
  const byKey = new Map(edits.map((e) => [e.key, e]));
  const out: PriceItem[] = learned.map((l) => {
    const key = priceKey(l.description);
    const e = byKey.get(key);
    return {
      key,
      name: e?.name?.trim() || l.description,
      price: e?.price ?? l.last,
      kind: e?.kind ?? l.kind,
      vatRate: e?.vatRate ?? l.vatRate,
      hidden: !!e?.hidden,
      learned: l,
      edited: !!e,
    };
  });
  for (const e of edits) {
    if (!isOwnKey(e.key) || !e.name?.trim() || e.price === undefined) continue;
    out.push({ key: e.key, name: e.name.trim(), price: e.price, kind: e.kind ?? "fixed", vatRate: e.vatRate ?? "standard", hidden: !!e.hidden, learned: null, edited: true });
  }
  // What he charges for most often first; what he added himself, which has
  // never been charged, after it in the order he added it.
  return out;
}

// The edit that makes `item` read as `next`. Only what differs from the
// learned figure is kept, so a learned price that later goes up still
// shows through anywhere he did not set his own.
export function editFor(item: PriceItem, next: { name: string; price: number; kind: PriceKind; vatRate: VatRateKind; hidden: boolean }): PriceEdit | null {
  const l = item.learned;
  const e: PriceEdit = { key: item.key };
  if (!l) return { key: item.key, name: next.name.trim(), price: next.price, kind: next.kind, vatRate: next.vatRate, hidden: next.hidden || undefined };
  if (next.name.trim() && next.name.trim() !== l.description) e.name = next.name.trim();
  if (next.price !== l.last) e.price = next.price;
  if (next.kind !== l.kind) e.kind = next.kind;
  if (next.vatRate !== l.vatRate) e.vatRate = next.vatRate;
  if (next.hidden) e.hidden = true;
  return Object.keys(e).length > 1 ? e : null;
}

export function withEdit(edits: PriceEdit[], key: string, edit: PriceEdit | null): PriceEdit[] {
  const rest = edits.filter((e) => e.key !== key);
  return edit ? [...rest, edit] : rest;
}

// The jsonb column is whatever was last written to it; only well-formed
// edits are believed.
export function readEdits(raw: unknown): PriceEdit[] {
  if (!Array.isArray(raw)) return [];
  const out: PriceEdit[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object" || typeof (r as PriceEdit).key !== "string" || !(r as PriceEdit).key) continue;
    const x = r as Record<string, unknown>;
    const e: PriceEdit = { key: x.key as string };
    if (typeof x.name === "string") e.name = x.name;
    if (typeof x.price === "number" && Number.isFinite(x.price) && x.price >= 0) e.price = x.price;
    if (x.kind === "fixed" || x.kind === "hourly") e.kind = x.kind;
    if (typeof x.vatRate === "string" && (VAT_RATE_KINDS as string[]).includes(x.vatRate)) e.vatRate = x.vatRate as VatRateKind;
    if (x.hidden === true) e.hidden = true;
    out.push(e);
  }
  return out;
}

// The line an item puts on an invoice or quote. A fixed price is one of
// it; an hourly rate is the rate times the hours, so the hours go in the
// quantity and the printed line reads "3 x £45.00".
export function lineFor(item: PriceItem, hours = 1): InvoiceItem {
  return {
    description: item.name,
    quantity: item.kind === "hourly" ? Math.max(0, hours) : 1,
    unitPrice: item.price,
    vatRate: item.vatRate,
  };
}

export const lineTotal = (item: PriceItem, hours = 1) => Math.round(lineFor(item, hours).quantity * item.price * 100) / 100;

export const priceWords = (item: Pick<PriceItem, "price" | "kind">) => `${money2(item.price)}${item.kind === "hourly" ? " an hour" : ""}`;

// What to offer on a form, the customer's own prices first as before, with
// his price list laid over them: a hidden item is not offered, a renamed
// one goes by its new name, and his own price wins over the learned one.
// Items he added himself follow, all of them, since they have never been
// charged and would otherwise never make the cut.
export function offerFromList(
  offered: { description: string; unitPrice: number; vatRate: VatRateKind }[],
  list: PriceItem[],
  limit = 12
): PriceItem[] {
  const byKey = new Map(list.map((i) => [i.key, i]));
  const out: PriceItem[] = [];
  const seen = new Set<string>();
  for (const o of offered) {
    const k = priceKey(o.description);
    if (seen.has(k)) continue;
    seen.add(k);
    const i = byKey.get(k);
    if (i?.hidden) continue;
    out.push(
      i
        ? { ...i, price: i.learned && i.price !== i.learned.last ? i.price : o.unitPrice, vatRate: i.edited ? i.vatRate : o.vatRate }
        : { key: k, name: o.description, price: o.unitPrice, kind: "fixed", vatRate: o.vatRate, hidden: false, learned: null, edited: false }
    );
  }
  return [...out.slice(0, limit), ...list.filter((i) => !i.learned && !i.hidden)];
}
