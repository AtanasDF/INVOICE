"use client";

import Link from "next/link";

import { useState } from "react";
import { NumberInput } from "@/components/free-invoice/fields";
import { money } from "@/components/quote/QuoteDocument";
import CustomerPicker, { NewCustomerStart } from "@/components/quote/CustomerPicker";
import ClearFormButton from "@/components/ClearFormButton";
import PriceFinder from "@/components/PriceFinder";
import { addDays, todayIso } from "@/lib/freeInvoiceDraft";
import type { Client, InvoiceItem, QuoteDeposit } from "@/lib/storage";
import { depositGross } from "@/lib/quoteDeposit";
import { VAT_RATE_KINDS, VAT_RATE_LABELS, VatRateKind, computeInvoiceTotals } from "@/lib/vat";
import { errorText } from "@/lib/errorText";

export type QuoteFormValue = {
  clientId: string;
  number: string;
  date: string;
  validUntil: string;
  items: InvoiceItem[];
  notes: string;
  deposit: QuoteDeposit | null;
};

const BLANK_LINE: InvoiceItem = { description: "", quantity: 1, unitPrice: 0, vatRate: "standard" };
const INPUT = "w-full rounded-lg border px-3 py-2";

const NO_ONE: NewCustomerStart = { name: "", email: "", address: "" };

// newCustomer: a customer to add (one brought over from the Free page),
// opened in the picker to start with. onClear: offered on a new quote.
export default function QuoteForm({ initial, clients, vatRegistered, saveLabel, onSave, onCancel, onClientAdded, newCustomer = null, onClear }: {
  initial: QuoteFormValue;
  clients: Client[];
  vatRegistered: boolean;
  saveLabel: string;
  onSave: (value: QuoteFormValue) => Promise<void>;
  onCancel?: () => void;
  onClientAdded: (client: Client) => void;
  newCustomer?: NewCustomerStart | null;
  onClear?: () => void;
}) {
  const [v, setV] = useState<QuoteFormValue>(initial.items.length ? initial : { ...initial, items: [{ ...BLANK_LINE }] });
  const anyone = () => clients.some((c) => !c.archived);
  const picked = clients.find((c) => c.id === v.clientId) ?? null;
  const [adding, setAdding] = useState<NewCustomerStart | null>(() => newCustomer ?? (anyone() || clients.some((c) => c.id === initial.clientId) ? null : NO_ONE));
  // Which line is being priced up against what it usually costs.
  const [finding, setFinding] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<QuoteFormValue>) => setV((prev) => ({ ...prev, ...patch }));
  const setLine = (i: number, patch: Partial<InvoiceItem>) => set({ items: v.items.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const lines = v.items.filter((l) => l.description.trim() || l.unitPrice);
  const totals = computeInvoiceTotals(lines, vatRegistered);
  const depositShown = depositGross({ deposit: v.deposit, items: lines }, vatRegistered);

  async function save() {
    if (adding) return setError("Finish adding the new customer (Add customer), or cancel it, first.");
    if (!v.clientId) return setError("Pick who the quote is for.");
    if (!v.number.trim()) return setError("Give the quote a number.");
    if (!lines.length) return setError("Add at least one line.");
    // Stored to 2 decimals, so check what will be stored.
    const deposit = v.deposit && { ...v.deposit, value: Math.round(v.deposit.value * 100) / 100 };
    if (deposit?.kind === "percent" && !(deposit.value > 0 && deposit.value < 100)) return setError("A deposit percentage is between 0 and 100.");
    if (deposit?.kind === "amount" && !(deposit.value > 0 && deposit.value <= Math.round(totals.total * 100) / 100)) return setError("The deposit has to be more than £0 and no more than the total.");
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...v, number: v.number.trim(), items: lines, deposit });
    } catch (err) {
      setError(errorText(err, "Could not save the quote."));
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
      <div aria-invalid={error ? true : undefined} aria-describedby={error ? "quote-error" : undefined}>
      <CustomerPicker
        people={clients}
        value={v.clientId}
        onChange={(clientId) => set({ clientId })}
        onAdded={onClientAdded}
        adding={adding}
        onAdding={(start) => {
          setAdding(start);
          setError(null);
        }}
      />
      </div>
      {/* Atanas, 2026-09-23: "so people can check companies before they send
          the quotation". Right here is the moment -- somebody is about to put
          their prices in front of a company they may know nothing about. When
          the contact was picked off the register we know exactly which company
          to open (migration-030); otherwise it opens the search. */}
      {picked && (
        <p className="text-xs text-neutral-500">
          <Link
            href={picked.companyNumber ? `/check-company?number=${encodeURIComponent(picked.companyNumber)}` : "/check-company"}
            className="font-medium text-neutral-700 underline"
          >
            Check {picked.name} on the Companies House register
          </Link>{" "}
          &mdash; free, before you send your prices.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="text-xs text-neutral-500">Quote number</label>
          <input aria-label="Quote number" className={INPUT} value={v.number} onChange={(e) => set({ number: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-neutral-500">Date</label>
          <input type="date" aria-label="Date" className={INPUT} value={v.date} onChange={(e) => set({ date: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-neutral-500">Valid until</label>
          <input type="date" aria-label="Valid until" className={INPUT} value={v.validUntil} onChange={(e) => set({ validUntil: e.target.value })} />
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
              aria-label="What the work or item is"
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
            {l.description.trim() && (
              <div className="col-span-12">
                <button type="button" onClick={() => setFinding(finding === i ? null : i)} aria-expanded={finding === i} className="text-xs font-medium text-neutral-700 underline">
                  {finding === i ? "Close" : "Find it cheaper"}
                </button>
                {finding === i && (
                  <div className="mt-2">
                    <PriceFinder description={l.description} quantity={l.quantity} priced={l.unitPrice || null} onClose={() => setFinding(null)} />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <button type="button" onClick={() => set({ items: [...v.items, { ...BLANK_LINE }] })} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700">
          Add line
        </button>
      </div>

      <div>
        <label className="text-xs text-neutral-500">Deposit to book the work (optional)</label>
        <div className="flex gap-2">
          <select
            aria-label="Deposit"
            className="rounded-lg border px-3 py-2"
            value={v.deposit?.kind ?? ""}
            onChange={(e) => set({ deposit: e.target.value ? { kind: e.target.value as QuoteDeposit["kind"], value: e.target.value === "percent" ? 25 : 0 } : null })}
          >
            <option value="">No deposit</option>
            <option value="percent">% of the total</option>
            <option value="amount">Fixed amount (£)</option>
          </select>
          {v.deposit && (
            <NumberInput
              className="w-28 rounded-lg border px-3 py-2 text-right"
              aria-label={v.deposit.kind === "percent" ? "Deposit percentage" : "Deposit amount"}
              value={v.deposit.value}
              onChange={(value) => set({ deposit: { ...v.deposit!, value } })}
            />
          )}
        </div>
        {v.deposit && depositShown !== null && depositShown > 0 && (
          <p className="mt-1 text-xs text-neutral-500">{money(depositShown)}{vatRegistered ? " incl. VAT" : ""}, invoiced on its own once the quote is accepted.</p>
        )}
      </div>

      <div>
        <label className="text-xs text-neutral-500" htmlFor="quote-notes">Notes (printed on the quote)</label>
        <textarea id="quote-notes" rows={3} className={INPUT} placeholder="What's included, what isn't, start date…" value={v.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>

      <div className="text-right text-sm text-neutral-700">
        {vatRegistered && <div>Subtotal {money(totals.subtotal)} · VAT {money(totals.totalVat)}</div>}
        <div className="text-lg font-bold">Total {money(totals.total)}</div>
      </div>

      {error && <p id="quote-error" role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Saving…" : saveLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
            Cancel
          </button>
        )}
        {onClear && (
          <ClearFormButton
            className="ml-auto"
            disabled={saving || !(v.clientId || lines.length || v.notes || v.deposit || adding?.name)}
            onClear={() => {
              const today = todayIso();
              setV({ clientId: "", number: v.number, date: today, validUntil: defaultValidUntil(today), items: [{ ...BLANK_LINE }], notes: "", deposit: null });
              setAdding(anyone() ? null : NO_ONE);
              setError(null);
              onClear();
            }}
          />
        )}
      </div>
    </div>
  );
}

export function defaultValidUntil(date: string): string {
  return addDays(date, 30);
}
