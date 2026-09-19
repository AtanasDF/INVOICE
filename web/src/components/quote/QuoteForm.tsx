"use client";

import { useState } from "react";
import { NumberInput } from "@/components/free-invoice/fields";
import { addDays } from "@/lib/freeInvoiceDraft";
import type { Client, InvoiceItem } from "@/lib/storage";
import { VAT_RATE_KINDS, VAT_RATE_LABELS, VatRateKind, computeInvoiceTotals } from "@/lib/vat";
import { errorText } from "@/lib/errorText";

export type QuoteFormValue = {
  clientId: string;
  number: string;
  date: string;
  validUntil: string;
  items: InvoiceItem[];
  notes: string;
};

const BLANK_LINE: InvoiceItem = { description: "", quantity: 1, unitPrice: 0, vatRate: "standard" };
const INPUT = "w-full rounded-lg border px-3 py-2";

export default function QuoteForm({ initial, clients, vatRegistered, saveLabel, onSave, onCancel }: {
  initial: QuoteFormValue;
  clients: Client[];
  vatRegistered: boolean;
  saveLabel: string;
  onSave: (value: QuoteFormValue) => Promise<void>;
  onCancel?: () => void;
}) {
  const [v, setV] = useState<QuoteFormValue>(initial.items.length ? initial : { ...initial, items: [{ ...BLANK_LINE }] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<QuoteFormValue>) => setV((prev) => ({ ...prev, ...patch }));
  const setLine = (i: number, patch: Partial<InvoiceItem>) => set({ items: v.items.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const lines = v.items.filter((l) => l.description.trim() || l.unitPrice);
  const totals = computeInvoiceTotals(lines, vatRegistered);
  const billable = clients.filter((c) => c.kind === "client" && (!c.archived || c.id === v.clientId));

  async function save() {
    if (!v.clientId) return setError("Pick who the quote is for.");
    if (!v.number.trim()) return setError("Give the quote a number.");
    if (!lines.length) return setError("Add at least one line.");
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...v, number: v.number.trim(), items: lines });
    } catch (err) {
      setError(errorText(err, "Could not save the quote."));
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
      <div>
        <label className="text-xs text-neutral-500">For</label>
        <select className={INPUT} value={v.clientId} onChange={(e) => set({ clientId: e.target.value })}>
          <option value="">Pick a client…</option>
          {billable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="text-xs text-neutral-500">Quote number</label>
          <input className={INPUT} value={v.number} onChange={(e) => set({ number: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-neutral-500">Date</label>
          <input type="date" className={INPUT} value={v.date} onChange={(e) => set({ date: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-neutral-500">Valid until</label>
          <input type="date" className={INPUT} value={v.validUntil} onChange={(e) => set({ validUntil: e.target.value })} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-medium text-neutral-500 sm:grid">
          <span className={vatRegistered ? "col-span-4" : "col-span-6"}>Description</span>
          <span className="col-span-2 text-right">Qty</span>
          <span className="col-span-3 text-right">Unit price</span>
          {vatRegistered && <span className="col-span-2">VAT</span>}
        </div>
        {v.items.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 border-b pb-3 sm:border-0 sm:pb-0">
            <input
              className={`col-span-12 ${vatRegistered ? "sm:col-span-4" : "sm:col-span-6"} rounded-lg border px-3 py-2`}
              placeholder="What the work or item is"
              value={l.description}
              onChange={(e) => setLine(i, { description: e.target.value })}
            />
            <NumberInput className={`${vatRegistered ? "col-span-3" : "col-span-4"} rounded-lg border px-3 py-2 text-right sm:col-span-2`} aria-label="Quantity" value={l.quantity} onChange={(quantity) => setLine(i, { quantity })} />
            <NumberInput className={`${vatRegistered ? "col-span-4" : "col-span-7"} rounded-lg border px-3 py-2 text-right sm:col-span-3`} aria-label="Unit price" placeholder="Price £" value={l.unitPrice} onChange={(unitPrice) => setLine(i, { unitPrice })} />
            {vatRegistered && (
              <select aria-label="VAT rate" className="col-span-4 rounded-lg border px-1 py-2 text-xs sm:col-span-2" value={l.vatRate} onChange={(e) => setLine(i, { vatRate: e.target.value as VatRateKind })}>
                {VAT_RATE_KINDS.map((k) => <option key={k} value={k}>{VAT_RATE_LABELS[k]}</option>)}
              </select>
            )}
            <button
              type="button"
              onClick={() => set({ items: v.items.filter((_, j) => j !== i) })}
              disabled={v.items.length === 1}
              aria-label={`Remove line ${i + 1}`}
              className="col-span-1 text-sm text-neutral-500 disabled:opacity-30"
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={() => set({ items: [...v.items, { ...BLANK_LINE }] })} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700">
          Add line
        </button>
      </div>

      <div>
        <label className="text-xs text-neutral-500">Notes (printed on the quote)</label>
        <textarea rows={3} className={INPUT} placeholder="What's included, what isn't, start date…" value={v.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>

      <div className="text-right text-sm text-neutral-700">
        {vatRegistered && <div>Subtotal £{totals.subtotal.toFixed(2)} · VAT £{totals.totalVat.toFixed(2)}</div>}
        <div className="text-lg font-bold">Total £{totals.total.toFixed(2)}</div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Saving…" : saveLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export function defaultValidUntil(date: string): string {
  return addDays(date, 30);
}
