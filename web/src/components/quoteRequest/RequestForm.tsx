"use client";

import Link from "next/link";
import { useState } from "react";
import AddressFields from "@/components/AddressFields";
import { NumberInput } from "@/components/free-invoice/fields";
import type { Client } from "@/lib/storage";
import type { RequestItem } from "@/lib/quoteCompare";
import { RequestInput, newItemId } from "@/lib/quoteRequests";
import { errorText } from "@/lib/errorText";
import { todayIso } from "@/lib/freeInvoiceDraft";

const INPUT = "w-full rounded-lg border px-3 py-2";
const blankLine = (): RequestItem => ({ id: newItemId(), description: "", quantity: 1, unit: "", note: "" });
// The most suppliers one request goes to: every combination of them is
// tried when splitting the order.
export const MAX_SUPPLIERS = 10;

// The list to be priced, and (for a new request) who to ask. The same form
// edits the list until it has gone to anyone.
export default function RequestForm({ initial, suppliers, saveLabel, onSave, onCancel }: {
  initial: RequestInput;
  // Offered as checkboxes on a new request; null when editing.
  suppliers: Client[] | null;
  saveLabel: string;
  onSave: (value: RequestInput, supplierIds: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [v, setV] = useState<RequestInput>(initial.items.length ? initial : { ...initial, items: [blankLine()] });
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<RequestInput>) => setV((prev) => ({ ...prev, ...patch }));
  const setLine = (id: string, patch: Partial<RequestItem>) => set({ items: v.items.map((l) => (l.id === id ? { ...l, ...patch } : l)) });

  async function save() {
    const items = v.items.filter((l) => l.description.trim()).map((l) => ({ ...l, description: l.description.trim(), unit: l.unit.trim(), note: l.note.trim() }));
    if (!v.title.trim()) return setError("Give the request a name, e.g. the job it's for.");
    if (!items.length) return setError("Add at least one item.");
    if (items.some((l) => !(l.quantity > 0))) return setError("Every item needs a quantity above 0.");
    if (v.neededBy && v.neededBy < todayIso() && v.neededBy !== initial.neededBy) return setError("The needed-by date is in the past: suppliers couldn't answer.");
    if (suppliers && !picked.length) return setError("Pick at least one supplier to ask.");
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...v, title: v.title.trim(), items }, picked);
    } catch (err) {
      setError(errorText(err, "Could not save the request."));
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
      <div>
        <label className="text-xs text-neutral-500" htmlFor="qr-title">What it&apos;s for</label>
        <input id="qr-title" className={INPUT} placeholder="e.g. Kitchen extension, 12 High St" value={v.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} />
      </div>

      <div className="space-y-3">
        <p className="text-xs text-neutral-500">Items to price</p>
        {v.items.map((l, i) => (
          <div key={l.id} className="grid grid-cols-12 gap-2 border-b pb-3">
            <input
              className="col-span-11 rounded-lg border px-3 py-2"
              aria-label={`Item ${i + 1}`}
              placeholder="What you need, e.g. 4x2 C24 treated 3.6m"
              value={l.description}
              onChange={(e) => setLine(l.id, { description: e.target.value })}
            />
            <button
              type="button"
              onClick={() => set({ items: v.items.filter((x) => x.id !== l.id) })}
              disabled={v.items.length === 1}
              aria-label={`Remove item ${i + 1}`}
              className="col-span-1 text-sm text-neutral-500 disabled:opacity-30"
            >
              ✕
            </button>
            <NumberInput className="col-span-4 rounded-lg border px-3 py-2 text-right" aria-label={`Quantity for item ${i + 1}`} placeholder="Qty" value={l.quantity} onChange={(quantity) => setLine(l.id, { quantity })} />
            <input className="col-span-8 rounded-lg border px-3 py-2" aria-label={`Unit for item ${i + 1}`} placeholder="Unit, e.g. lengths, bags, m²" value={l.unit} onChange={(e) => setLine(l.id, { unit: e.target.value })} maxLength={30} />
            <input className="col-span-12 rounded-lg border px-3 py-2 text-sm" aria-label={`Note for item ${i + 1}`} placeholder="Note (optional): brand, size, or equivalent" value={l.note} onChange={(e) => setLine(l.id, { note: e.target.value })} maxLength={200} />
          </div>
        ))}
        <button type="button" onClick={() => set({ items: [...v.items, blankLine()] })} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700">
          Add item
        </button>
      </div>

      <div className="sm:w-1/2">
        <label className="text-xs text-neutral-500" htmlFor="qr-needed">Needed by (optional)</label>
        <input id="qr-needed" type="date" className={INPUT} value={v.neededBy ?? ""} onChange={(e) => set({ neededBy: e.target.value || null })} />
      </div>

      <AddressFields
        address={v.siteAddress}
        onAddress={(siteAddress: string) => set({ siteAddress })}
        label="Deliver to (optional)"
        streetPlaceholder="Site number and street"
      />

      <div>
        <label className="text-xs text-neutral-500" htmlFor="qr-notes">Notes for the suppliers (optional)</label>
        <textarea id="qr-notes" rows={3} className={INPUT} placeholder="Access, delivery times, anything they should know" value={v.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={4000} />
      </div>

      {suppliers && (
        <fieldset className="min-w-0 space-y-2">
          <legend className="text-xs text-neutral-500">Ask these suppliers (up to {MAX_SUPPLIERS})</legend>
          {suppliers.length === 0 ? (
            <p className="text-sm text-neutral-600">
              No suppliers yet.{" "}
              <Link href="/clients/new?kind=supplier" className="font-medium text-neutral-900 underline">Add a supplier</Link> first, with their email.
            </p>
          ) : (
            suppliers.map((s) => {
              const on = picked.includes(s.id);
              return (
                <label key={s.id} className="flex items-start gap-3 rounded-lg border px-3 py-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={on}
                    disabled={!on && picked.length >= MAX_SUPPLIERS}
                    onChange={() => setPicked((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{s.name}</span>
                    <span className="block truncate text-xs text-neutral-500">{s.email || "No email saved: you can type their prices in when they reply"}</span>
                  </span>
                </label>
              );
            })
          )}
        </fieldset>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Saving…" : saveLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
          Cancel
        </button>
      </div>
    </div>
  );
}
