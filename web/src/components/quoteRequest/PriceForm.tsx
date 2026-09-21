"use client";

import { ReactNode } from "react";
import { amountOrNull } from "@/components/free-invoice/fields";
import { LinePrice, RequestItem, formatPence, quantityText, supplierTotal } from "@/lib/quoteCompare";

const INPUT = "w-full rounded-lg border px-3 py-2";

// Prices are held as typed, so an empty box (not priced) and "0" (free)
// stay different.
export type PriceDraft = {
  lines: Record<string, { text: string; unavailable: boolean; note: string }>;
  delivery: string;
  vatIncluded: boolean;
  validUntil: string;
  note: string;
};

const money = (n: number | null) => (n === null ? "" : String(Number(n.toFixed(4))));

export function draftFrom(items: RequestItem[], from?: { prices: Record<string, LinePrice>; delivery: number | null; vatIncluded: boolean; validUntil: string | null; note: string }): PriceDraft {
  return {
    lines: Object.fromEntries(items.map((i) => {
      const p = from?.prices[i.id];
      return [i.id, { text: p && !p.unavailable ? money(p.price) : "", unavailable: !!p?.unavailable, note: p?.note ?? "" }];
    })),
    delivery: money(from?.delivery ?? null),
    vatIncluded: from?.vatIncluded ?? false,
    validUntil: from?.validUntil ?? "",
    note: from?.note ?? "",
  };
}

const amountOf = (text: string): number | null | "bad" => {
  if (!text.trim()) return null;
  // Anything that isn't a plain number is refused, not read as nothing.
  // The box's own placeholder ("per length", "per m2") invites exactly the
  // answer that used to break this: "12.50 per length" parsed to 0, the
  // response submitted, and that supplier was cheapest on the line at
  // £0.00 for ever after.
  const n = amountOrNull(text);
  return n === null || n < 0 ? "bad" : n;
};

// What the draft says, or why it can't be sent. Every line needs a price
// or "can't supply", so a gap is never mistaken for a missed box.
export function readDraft(items: RequestItem[], d: PriceDraft, requireEvery = true):
  | { ok: true; prices: Record<string, LinePrice>; delivery: number | null }
  | { ok: false; error: string } {
  const prices: Record<string, LinePrice> = {};
  for (const [n, item] of items.entries()) {
    const l = d.lines[item.id];
    const price = l.unavailable ? null : amountOf(l.text);
    // Say what is wrong with it: a supplier who typed "12.50 per length"
    // has no way to guess that the words are the problem.
    if (price === "bad") return { ok: false, error: `Line ${n + 1} (${item.description}): put the price as just a number, like 12.50 — no words or ranges.` };
    if (price === null && !l.unavailable && requireEvery) return { ok: false, error: `Add a price for line ${n + 1} (${item.description}), or tick "Can't supply".` };
    prices[item.id] = { price, unavailable: l.unavailable, note: l.note.trim() };
  }
  const delivery = amountOf(d.delivery);
  if (delivery === "bad") return { ok: false, error: "Put the delivery cost as just a number, like 25 — or leave it empty if there isn't one." };
  return { ok: true, prices, delivery };
}

export default function PriceForm({ items, draft, onChange, disabled, lineExtra, children }: {
  items: RequestItem[];
  draft: PriceDraft;
  onChange: (d: PriceDraft) => void;
  disabled?: boolean;
  lineExtra?: (item: RequestItem) => ReactNode;
  children?: ReactNode;
}) {
  const setLine = (id: string, patch: Partial<PriceDraft["lines"][string]>) => onChange({ ...draft, lines: { ...draft.lines, [id]: { ...draft.lines[id], ...patch } } });
  const read = readDraft(items, draft, false);
  const total = read.ok ? supplierTotal({ id: "", name: "", prices: read.prices, delivery: read.delivery, vatIncluded: draft.vatIncluded, validUntil: null }, items) : null;
  const vatWord = draft.vatIncluded ? "inc VAT" : "ex VAT";

  return (
    <div className="space-y-4">
      <fieldset className="min-w-0 space-y-3" disabled={disabled}>
        <legend className="sr-only">Prices</legend>
        {items.map((item) => {
          const l = draft.lines[item.id];
          const price = amountOf(l.text);
          return (
            <div key={item.id} className="space-y-2 border-b pb-3">
              <div>
                <p className="text-sm font-medium">{item.description}</p>
                <p className="text-xs text-neutral-500">
                  {quantityText(item)}
                  {item.note ? ` · ${item.note}` : ""}
                </p>
              </div>
              {lineExtra?.(item)}
              <div className="flex items-center gap-2">
                <div className="relative w-36 shrink-0">
                  <span className="pointer-events-none absolute left-3 top-2 text-neutral-500">£</span>
                  <input
                    inputMode="decimal"
                    className="w-full rounded-lg border py-2 pl-7 pr-3 text-right disabled:bg-neutral-100 disabled:text-neutral-400"
                    aria-label={`${item.description}: price per ${item.unit || "item"}`}
                    placeholder={`per ${item.unit || "item"}`}
                    value={l.unavailable ? "" : l.text}
                    disabled={l.unavailable}
                    onChange={(e) => setLine(item.id, { text: e.target.value })}
                  />
                </div>
                <span className="min-w-0 flex-1 text-right text-sm text-neutral-600">
                  {l.unavailable ? "Can't supply" : typeof price === "number" ? `= ${formatPence(Math.round(price * item.quantity * 100))}` : ""}
                </span>
              </div>
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input type="checkbox" aria-label={`${item.description}: can't supply`} checked={l.unavailable} onChange={(e) => setLine(item.id, { unavailable: e.target.checked })} />
                Can&apos;t supply
              </label>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                aria-label={`${item.description}: alternative or note`}
                placeholder="Alternative or note (optional)"
                value={l.note}
                onChange={(e) => setLine(item.id, { note: e.target.value })}
                maxLength={300}
              />
            </div>
          );
        })}

        <div>
          <label className="text-xs text-neutral-500" htmlFor="pf-delivery">Delivery (leave empty if free or included)</label>
          <div className="relative w-36">
            <span className="pointer-events-none absolute left-3 top-2 text-neutral-500">£</span>
            <input id="pf-delivery" inputMode="decimal" className="w-full rounded-lg border py-2 pl-7 pr-3 text-right" value={draft.delivery} onChange={(e) => onChange({ ...draft, delivery: e.target.value })} />
          </div>
        </div>

        <div role="radiogroup" aria-label="VAT" className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1">
          {[false, true].map((inc) => (
            <button
              key={String(inc)}
              type="button"
              role="radio"
              aria-checked={draft.vatIncluded === inc}
              onClick={() => onChange({ ...draft, vatIncluded: inc })}
              className={`rounded-md px-2 py-2 text-sm font-medium ${draft.vatIncluded === inc ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}
            >
              {inc ? "Prices include VAT" : "Prices exclude VAT"}
            </button>
          ))}
        </div>

        <div>
          <label className="text-xs text-neutral-500" htmlFor="pf-valid">Prices valid until (optional)</label>
          <input id="pf-valid" type="date" className={INPUT} value={draft.validUntil} onChange={(e) => onChange({ ...draft, validUntil: e.target.value })} />
        </div>

        <div>
          <label className="text-xs text-neutral-500" htmlFor="pf-note">Anything else (optional)</label>
          <textarea id="pf-note" rows={3} className={INPUT} placeholder="Lead times, terms, minimum order…" value={draft.note} onChange={(e) => onChange({ ...draft, note: e.target.value })} maxLength={2000} />
        </div>
        {children}
      </fieldset>

      {total && total.priced > 0 && (
        <div className="text-right text-sm text-neutral-700">
          {total.priced < items.length && <div>{total.priced} of {items.length} lines priced</div>}
          {total.deliveryEx > 0 && <div>Delivery {formatPence(draft.vatIncluded ? total.deliveryInc : total.deliveryEx)}</div>}
          <div className="text-lg font-bold">
            Total {formatPence(draft.vatIncluded ? total.inc : total.ex)} {vatWord}
          </div>
        </div>
      )}
    </div>
  );
}
