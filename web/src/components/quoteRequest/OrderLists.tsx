"use client";

import { useState, useSyncExternalStore } from "react";
import { longDate } from "@/components/invoice/InvoiceDocument";
import { Order, Plan, formatPence, orderText } from "@/lib/quoteCompare";
import type { QuoteRequest } from "@/lib/quoteRequests";

const SECONDARY = "rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700";

// One order per supplier the lines are picked from, as text to copy, share
// or email to them. Nothing is stored beyond the picks themselves.
export default function OrderLists({ plan, request, from, emailOf }: { plan: Plan; request: QuoteRequest; from: string; emailOf: (offerId: string) => string }) {
  const canShare = useSyncExternalStore(
    () => () => {},
    () => typeof navigator.share === "function",
    () => false
  );
  const [copied, setCopied] = useState<string | null>(null);
  const ctx = { title: request.title, from, siteAddress: request.siteAddress, neededBy: request.neededBy, longDate };

  async function copy(order: Order, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(order.offer.id);
      setTimeout(() => setCopied((c) => (c === order.offer.id ? null : c)), 2000);
    } catch {
      setCopied(null);
    }
  }

  return (
    <section className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm" aria-labelledby="orders-heading">
      <h2 id="orders-heading" className="font-semibold">Orders</h2>
      {!plan.orders.length ? (
        <p className="mt-1 text-sm text-neutral-600">Nothing picked yet. Tap prices in Compare to choose where each line comes from.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-neutral-600">
            {plan.orders.length === 1 ? "One order" : `${plan.orders.length} orders`}: {formatPence(plan.ex)} ex VAT ({formatPence(plan.inc)} inc VAT) with delivery. Send each supplier their list to place the order.
          </p>
          {plan.unpicked.length > 0 && <p className="mt-1 text-sm text-neutral-600">Not ordering: {plan.unpicked.map((i) => i.description).join(", ")}.</p>}
          <div className="mt-3 space-y-3">
            {plan.orders.map((order) => {
              const text = orderText(order, ctx);
              const email = emailOf(order.offer.id);
              return (
                <div key={order.offer.id} className="rounded-lg border p-3" data-testid="order">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate font-medium">{order.offer.name}</p>
                    <p className="shrink-0 font-semibold">{formatPence(order.ex)} <span className="text-xs font-normal text-neutral-500">ex VAT</span></p>
                  </div>
                  <p className="text-xs text-neutral-500">
                    {order.items.length} {order.items.length === 1 ? "line" : "lines"}
                    {order.deliveryEx ? ` · delivery ${formatPence(order.deliveryEx)}` : ""} · {formatPence(order.inc)} inc VAT
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap wrap-anywhere rounded-lg bg-neutral-50 p-3 font-sans text-sm text-neutral-800">{text}</pre>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => copy(order, text)} className={SECONDARY}>
                      {copied === order.offer.id ? "Copied" : "Copy"}
                    </button>
                    {email && (
                      <a href={`mailto:${email}?subject=${encodeURIComponent(`Order: ${request.title}`)}&body=${encodeURIComponent(text)}`} className={SECONDARY}>
                        Email
                      </a>
                    )}
                    {canShare && (
                      <button type="button" onClick={() => navigator.share({ title: `Order: ${request.title}`, text }).catch(() => {})} className={SECONDARY}>
                        Share
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
