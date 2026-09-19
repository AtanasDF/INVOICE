"use client";

import { Comparison, Offer, Picks, Plan, RequestItem, cellFor, cheapestFor, formatPence, isExpired, planFor, quantityText, supplierTotal } from "@/lib/quoteCompare";
import { shortDate } from "@/components/quoteRequest/dates";

const SECONDARY = "rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700 disabled:opacity-50";

const names = (plan: Plan) => {
  const n = plan.orders.map((o) => o.offer.name);
  return n.length < 2 ? n.join("") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
};
const samePicks = (a: Picks, b: Picks) => Object.keys({ ...a, ...b }).every((k) => (a[k] ?? null) === (b[k] ?? null));

// Rows are the items asked for, columns the suppliers who answered; each
// cell is their price for the whole quantity, ex VAT. The cheapest per line
// is labelled; the dark cell is where that line will be ordered from, and
// tapping another price moves it there.
export default function Compare({ items, offers, comparison, picks, own, today, waiting, declined, busy, onPick, onUse, onFollow }: {
  items: RequestItem[];
  offers: Offer[];
  comparison: Comparison;
  picks: Picks;
  // The picks are the owner's own, saved on the request; otherwise they
  // follow the best value as answers come in.
  own: boolean;
  today: string;
  waiting: string[];
  declined: string[];
  busy: boolean;
  onPick: (itemId: string, offerId: string | null) => void;
  onUse: (plan: Plan) => void;
  // Back to following the best value.
  onFollow: () => void;
}) {
  const { single, split, recommended, splitSaves, uncovered, eligible } = comparison;
  const current = planFor(offers, items, picks);
  const naive = planFor(offers, items, Object.fromEntries(items.map((i) => [i.id, cheapestFor(eligible, i)[0] ?? null])));
  const totals = new Map(offers.map((o) => [o.id, supplierTotal(o, items)]));

  return (
    <section className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm" aria-labelledby="compare-heading">
      <h2 id="compare-heading" className="font-semibold">Compare</h2>
      {!offers.length ? (
        <p className="mt-1 text-sm text-neutral-600">No prices yet. They&apos;ll show here side by side as suppliers answer.</p>
      ) : (
        <>
          <div className="mt-2 space-y-2 text-sm text-neutral-700" data-testid="recommendation">
            {!recommended ? (
              <p>None of the prices can be used: every answer has expired. Tap a price to pick it anyway.</p>
            ) : recommended === split && single && splitSaves > 0 ? (
              <p>
                <strong>Best value: split the order</strong> between {names(split)}. {formatPence(split.ex)} ex VAT with {split.orders.length} deliveries,{" "}
                {formatPence(splitSaves)} less than everything from {single.orders[0].offer.name} ({formatPence(single.ex)}).
              </p>
            ) : recommended === split && !single ? (
              <p>
                No one supplier priced every line. <strong>Best value: split the order</strong> between {names(recommended)}, {formatPence(recommended.ex)} ex VAT with delivery.
              </p>
            ) : (
              <>
                <p>
                  <strong>Best value: everything from {names(recommended)}</strong>, {formatPence(recommended.ex)} ex VAT ({formatPence(recommended.inc)} inc VAT), delivery included.
                </p>
                {naive.orders.length > 1 && (
                  <p className="text-neutral-600">
                    Buying each line where it&apos;s cheapest would come to {formatPence(naive.ex)} once {naive.orders.length} deliveries are paid, so splitting isn&apos;t worth it.
                  </p>
                )}
              </>
            )}
            {uncovered.length > 0 && <p className="text-neutral-600">Nobody priced: {uncovered.map((i) => i.description).join(", ")}.</p>}
            {own && recommended && !samePicks(current.picks, recommended.picks) && (
              <p className="text-neutral-600">Your picks come to {formatPence(current.ex)} ex VAT with delivery.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {recommended && !samePicks(current.picks, recommended.picks) && (
                <button type="button" onClick={onFollow} disabled={busy} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                  Use the best value
                </button>
              )}
              {single && recommended !== single && !samePicks(current.picks, single.picks) && (
                <button type="button" onClick={() => onUse(single)} disabled={busy} className={SECONDARY}>
                  Everything from {single.orders[0].offer.name} instead
                </button>
              )}
            </div>
          </div>

          <p className="mt-4 text-xs text-neutral-500">Prices for the quantity asked, ex VAT. Tap a price to order that line from them; tap it again to leave the line out.</p>
          <div className="-mx-5 mt-2 overflow-x-auto px-5">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 min-w-28 border-b bg-white py-2 pr-2 text-left text-xs font-medium text-neutral-500">Item</th>
                  {offers.map((o) => (
                    <th key={o.id} scope="col" className="min-w-24 border-b px-1 py-2 text-right align-bottom font-medium">
                      <span className="block max-w-28 truncate" title={o.name}>{o.name}</span>
                      {isExpired(o, today) && <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600">Expired</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const cheapest = cheapestFor(offers, item);
                  return (
                    <tr key={item.id}>
                      <th scope="row" className="sticky left-0 z-10 max-w-36 border-b bg-white py-2 pr-2 text-left align-top font-normal">
                        <span className="block">{item.description}</span>
                        <span className="block text-xs text-neutral-500">{quantityText(item)}</span>
                      </th>
                      {offers.map((o) => {
                        const c = cellFor(o, item);
                        if (c.kind !== "price") {
                          return (
                            <td key={o.id} className="border-b px-1 py-2 text-right align-top text-xs text-neutral-500">
                              {c.kind === "unavailable" ? "Can't supply" : "No price"}
                            </td>
                          );
                        }
                        const picked = current.picks[item.id] === o.id;
                        return (
                          <td key={o.id} className="border-b px-1 py-1 text-right align-top">
                            <button
                              type="button"
                              aria-pressed={picked}
                              aria-label={`${item.description} from ${o.name}, ${formatPence(c.ex)}${cheapest.includes(o.id) ? ", cheapest" : ""}`}
                              disabled={busy}
                              onClick={() => onPick(item.id, picked ? null : o.id)}
                              className={`w-full rounded-lg px-2 py-1 text-right ${picked ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"}`}
                            >
                              <span className="block font-medium">{formatPence(c.ex)}</span>
                              {cheapest.includes(o.id) && <span className={`block text-xs ${picked ? "text-neutral-300" : "text-neutral-500"}`}>Cheapest</span>}
                              {c.note && <span className={`block max-w-28 truncate text-xs ${picked ? "text-neutral-300" : "text-neutral-500"}`} title={c.note}>{c.note}</span>}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr>
                  <th scope="row" className="sticky left-0 z-10 border-b bg-white py-2 pr-2 text-left font-normal text-neutral-600">Delivery</th>
                  {offers.map((o) => {
                    const t = totals.get(o.id)!;
                    return <td key={o.id} className="border-b px-1 py-2 text-right text-neutral-600">{t.deliveryEx ? formatPence(t.deliveryEx) : "Free"}</td>;
                  })}
                </tr>
                <tr>
                  <th scope="row" className="sticky left-0 z-10 border-b bg-white py-2 pr-2 text-left font-semibold">Total ex VAT</th>
                  {offers.map((o) => {
                    const t = totals.get(o.id)!;
                    return (
                      <td key={o.id} className="border-b px-1 py-2 text-right font-semibold">
                        {formatPence(t.ex)}
                        {t.priced < items.length && <span className="block text-xs font-normal text-neutral-500">{t.priced} of {items.length} lines</span>}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <th scope="row" className="sticky left-0 z-10 border-b bg-white py-2 pr-2 text-left font-normal text-neutral-600">Inc VAT</th>
                  {offers.map((o) => <td key={o.id} className="border-b px-1 py-2 text-right text-neutral-600">{formatPence(totals.get(o.id)!.inc)}</td>)}
                </tr>
                <tr>
                  <th scope="row" className="sticky left-0 z-10 bg-white py-2 pr-2 text-left font-normal text-neutral-600">Valid until</th>
                  {offers.map((o) => <td key={o.id} className="px-1 py-2 text-right text-neutral-600">{o.validUntil ? shortDate(o.validUntil) : "Not given"}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
          {offers.some((o) => o.vatIncluded) && <p className="mt-2 text-xs text-neutral-500">Prices quoted with VAT are shown here without it (at 20%) so they compare like for like.</p>}
          {(waiting.length > 0 || declined.length > 0) && (
            <p className="mt-2 text-xs text-neutral-500">
              {waiting.length > 0 && `Still waiting on ${waiting.join(", ")}. `}
              {declined.length > 0 && `Can't quote: ${declined.join(", ")}.`}
            </p>
          )}
        </>
      )}
    </section>
  );
}
