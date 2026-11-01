"use client";

import Link from "next/link";
import { useState } from "react";
import { NumberInput } from "@/components/free-invoice/fields";
import { money } from "@/lib/money";
import { lineFor, lineTotal, type PriceItem } from "@/lib/priceList";
import type { InvoiceItem } from "@/lib/storage";

// Tap what you charge for and it becomes a line. A fixed price goes straight
// on; a price per hour asks how many hours first, because a line at one hour
// that he forgets to change is a bill for an hour.
export default function PricePicker({ items, heading, onAdd }: { items: PriceItem[]; heading: string; onAdd: (line: InvoiceItem) => void }) {
  const [asking, setAsking] = useState<PriceItem | null>(null);
  const [hours, setHours] = useState(1);
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs text-neutral-500">
        {heading} <Link href="/prices" className="underline">Change prices</Link>
      </p>
      <div className="mt-1 flex flex-wrap gap-2">
        {items.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-expanded={s.kind === "hourly" ? asking?.key === s.key : undefined}
            onClick={() => {
              if (s.kind === "fixed") {
                setAsking(null);
                onAdd(lineFor(s));
                return;
              }
              setHours(1);
              setAsking(asking?.key === s.key ? null : s);
            }}
            className="rounded-full border px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 wrap-anywhere"
          >
            + {s.name} ({money(s.price)}{s.kind === "hourly" ? " an hour" : ""})
          </button>
        ))}
      </div>
      {asking && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-neutral-50 p-3">
          <div>
            <label className="text-xs text-neutral-500">Hours of {asking.name}</label>
            <NumberInput className="w-24 rounded-lg border px-3 py-2 text-right" aria-label={`Hours of ${asking.name}`} value={hours} onChange={setHours} />
          </div>
          <button
            type="button"
            disabled={!(hours > 0)}
            onClick={() => {
              onAdd(lineFor(asking, hours));
              setAsking(null);
            }}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Add {hours > 0 ? money(lineTotal(asking, hours)) : ""}
          </button>
          <button type="button" onClick={() => setAsking(null)} className="px-2 py-2 text-sm text-neutral-600">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
