"use client";

import Link from "next/link";
import { money } from "@/lib/money";
import { useEffect, useState } from "react";
import {
  BusinessProfile,
  Client,
  InvoiceItem,
  RecurringInvoice,
  businessProfileStore,
  clientsStore,
  invoicesStore,
  recurringInvoicesStore,
} from "@/lib/storage";
import { addMonths, nextDueFromDay } from "@/lib/recurrence";
import { VAT_RATE_KINDS, VAT_RATE_LABELS, VatRateKind, computeInvoiceTotals } from "@/lib/vat";
import { draftPlaceholderNumber } from "@/lib/invoiceNumber";
import { NumberInput } from "@/components/free-invoice/fields";
import ClearFormButton from "@/components/ClearFormButton";
import { loadFailed, saveFailed } from "@/lib/errorText";
import { todayISO } from "@/lib/today";
import { shortDate } from "@/lib/dates";

function RecurringTabs() {
  return (
    <div className="flex rounded-lg border text-sm w-fit">
      <Link href="/recurring" className="px-4 py-1.5 text-neutral-600">Expenses</Link>
      <button className="px-4 py-1.5 bg-neutral-900 text-white">Invoices</button>
    </div>
  );
}

const BLANK_ITEM: InvoiceItem = { description: "", quantity: 1, unitPrice: 0, vatRate: "standard" };

export default function RecurringInvoicesPage() {
  const [items, setItems] = useState<RecurringInvoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const [clientId, setClientId] = useState("");
  const [lineItems, setLineItems] = useState<InvoiceItem[]>([{ ...BLANK_ITEM }]);
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([recurringInvoicesStore.all(), clientsStore.all(), businessProfileStore.get()])
      .then(([r, c, biz]) => {
        setItems(r);
        setClients(c);
        setProfile(biz);
      })
      .catch((err) => setError(loadFailed(err, "your repeating invoices")))
      .finally(() => setLoading(false));
  }, []);

  const billableClients = clients.filter((c) => c.kind === "client" && !c.archived);
  const today = todayISO();

  function clientName(id: string) {
    return clients.find((c) => c.id === id)?.name || "No client";
  }

  function updateLineItem(idx: number, patch: Partial<InvoiceItem>) {
    setLineItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function addLine() {
    setLineItems((prev) => [...prev, { ...BLANK_ITEM }]);
  }

  function removeLine(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const filled = !!(clientId || paymentTerms || notes || dayOfMonth !== "1") || lineItems.length !== 1 || !!lineItems[0].description || lineItems[0].unitPrice !== 0 || lineItems[0].quantity !== 1;

  function clearForm() {
    setClientId("");
    setLineItems([{ ...BLANK_ITEM }]);
    setPaymentTerms("");
    setNotes("");
    setDayOfMonth("1");
    setError(null);
  }

  async function addRecurring(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || lineItems.every((it) => !it.description.trim())) return;
    setError(null);
    setSaving(true);
    try {
      const day = Math.min(28, Math.max(1, parseInt(dayOfMonth, 10) || 1));
      const created = await recurringInvoicesStore.add({
        clientId,
        items: lineItems.filter((it) => it.description.trim()),
        paymentTerms,
        notes,
        dayOfMonth: day,
        nextDueDate: nextDueFromDay(day),
        active: true,
      });
      setItems((prev) => [...prev, created].sort((a, b) => (a.nextDueDate < b.nextDueDate ? -1 : 1)));
      setClientId("");
      setLineItems([{ ...BLANK_ITEM }]);
      setPaymentTerms("");
      setNotes("");
      setDayOfMonth("1");
    } catch (err) {
      setError(saveFailed(err, "Could not save."));
    } finally {
      setSaving(false);
    }
  }

  // Generates a real draft invoice right now, using this recurring
  // invoice's client/items/terms -- same thing the daily cron does when
  // this falls due, just triggered by hand instead of waiting for it. No
  // real invoice number or counter advance yet -- same as any other
  // draft, that happens when it's marked sent.
  async function generateNow(item: RecurringInvoice) {
    setError(null);
    setGeneratingId(item.id);
    try {
      await invoicesStore.add({
        clientId: item.clientId,
        date: today,
        number: draftPlaceholderNumber(),
        items: item.items,
        notes: item.notes,
        dueDate: null,
        paymentTerms: item.paymentTerms,
        status: "draft",
        tags: [],
      });
    } catch (err) {
      setError(saveFailed(err, "Could not generate this invoice."));
      setGeneratingId(null);
      return;
    }
    // Same as "Log it" on the expenses side: the draft exists from here on,
    // so the reminder stops offering to make it again whether or not the
    // schedule write lands. Otherwise a failed second write reads as
    // "nothing happened" and a retry makes a duplicate draft invoice.
    const next = addMonths(item.nextDueDate, 1);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, nextDueDate: next } : i)));
    try {
      await recurringInvoicesStore.update(item.id, { nextDueDate: next });
    } catch (err) {
      setError(saveFailed(err, "The draft invoice is made, but the reminder didn't move on -- it'll ask again next time you open this page. Don't make it twice."));
    } finally {
      setGeneratingId(null);
    }
  }

  async function toggleActive(item: RecurringInvoice) {
    const next = !item.active;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, active: next } : i)));
    try {
      await recurringInvoicesStore.update(item.id, { active: next });
    } catch (err) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, active: !next } : i)));
      setError(saveFailed(err, "Could not update."));
    }
  }

  async function removeRecurring(id: string) {
    if (!window.confirm("Remove this repeating invoice? It stops being made each month, and this can't be undone.")) return;
    setError(null);
    try {
      await recurringInvoicesStore.remove(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(saveFailed(err, "Could not remove."));
    }
  }

  const totals = computeInvoiceTotals(lineItems, profile?.vatRegistered ?? false);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Recurring</h1>
        <p className="mt-1 text-neutral-600">
          Work that repeats on a schedule — generates a draft invoice automatically each month, for you to check
          and send.
        </p>
      </div>

      <RecurringTabs />

      <form onSubmit={addRecurring} className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <select className="w-full rounded-lg border px-3 py-2" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Select a client or company</option>
          {billableClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <div className="space-y-2">
          <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-medium text-neutral-500 sm:grid">
            <span className={profile?.vatRegistered ? "col-span-4" : "col-span-6"}>Description</span>
            <span className="col-span-2 text-right">Qty</span>
            <span className="col-span-3 text-right">Unit price</span>
            {profile?.vatRegistered && <span className="col-span-2">VAT</span>}
          </div>
          {lineItems.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 border-b pb-3 sm:border-0 sm:pb-0">
              <input
                className={`col-span-12 ${profile?.vatRegistered ? "sm:col-span-4" : "sm:col-span-6"} rounded-lg border px-3 py-2`}
                placeholder="Description (e.g. Monthly retainer)"
                value={it.description}
                onChange={(e) => updateLineItem(idx, { description: e.target.value })}
              />
              <NumberInput
                className={`${profile?.vatRegistered ? "col-span-3" : "col-span-4"} rounded-lg border px-3 py-2 text-right sm:col-span-2`}
                placeholder="Qty"
                aria-label="Quantity"
                value={it.quantity}
                onChange={(quantity) => updateLineItem(idx, { quantity })}
              />
              <NumberInput
                className={`${profile?.vatRegistered ? "col-span-4" : "col-span-7"} rounded-lg border px-3 py-2 text-right sm:col-span-3`}
                placeholder="Unit price"
                aria-label="Unit price"
                value={it.unitPrice}
                onChange={(unitPrice) => updateLineItem(idx, { unitPrice })}
              />
              {profile?.vatRegistered && (
                <select
                  aria-label="VAT rate"
                  className="col-span-4 rounded-lg border px-1 py-2 text-xs sm:col-span-2"
                  value={it.vatRate}
                  onChange={(e) => updateLineItem(idx, { vatRate: e.target.value as VatRateKind })}
                >
                  {VAT_RATE_KINDS.map((k) => <option key={k} value={k}>{VAT_RATE_LABELS[k]}</option>)}
                </select>
              )}
              <button type="button" onClick={() => removeLine(idx)} aria-label={`Remove line ${idx + 1}`} className="col-span-1 text-sm text-red-600">✕</button>
            </div>
          ))}
          <button type="button" onClick={addLine} className="text-sm font-medium text-blue-600">+ Add line</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <input className="rounded-lg border px-3 py-2" placeholder="Payment terms (e.g. 30 days)" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
          <div>
            <label className="text-xs text-neutral-500">Day of month it&apos;s generated (1-28)</label>
            <input
              type="number"
              min={1}
              max={28}
              className="w-24 rounded-lg border px-3 py-2"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
            />
          </div>
        </div>
        <textarea className="w-full rounded-lg border px-3 py-2" placeholder="Notes (optional, carried onto each generated invoice)" value={notes} onChange={(e) => setNotes(e.target.value)} />

        {profile?.vatRegistered && (
          <div className="text-right text-sm text-neutral-600">Subtotal: {money(totals.subtotal)}</div>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <button disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "Saving…" : "Add recurring invoice"}
          </button>
          <ClearFormButton onClear={clearForm} disabled={saving || !filled} />
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-3">
          {items.length === 0 && !error && <p className="text-sm text-neutral-500">No recurring invoices set up yet.</p>}
          {items.map((item) => {
            const due = item.nextDueDate <= today;
            const total = computeInvoiceTotals(item.items, profile?.vatRegistered ?? false).total;
            return (
              <div key={item.id} className="flex items-center justify-between rounded-xl border bg-white p-4 text-neutral-900 shadow-sm">
                <div>
                  <div className={`font-medium ${!item.active ? "text-neutral-400 line-through" : ""}`}>
                    {clientName(item.clientId)}
                  </div>
                  <div className="text-sm text-neutral-500">
                    {money(total)} · {item.items.length} {item.items.length === 1 ? "line" : "lines"}
                    {" · "}
                    {item.active ? (due ? <span className="font-medium text-amber-700">Due {shortDate(item.nextDueDate)}</span> : `Next: ${shortDate(item.nextDueDate)}`) : "Paused"}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {item.active && due && (
                    <button
                      onClick={() => generateNow(item)}
                      disabled={generatingId === item.id}
                      className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {generatingId === item.id ? "Generating…" : "Generate now"}
                    </button>
                  )}
                  <button onClick={() => toggleActive(item)} className="text-sm text-neutral-600">
                    {item.active ? "Pause" : "Resume"}
                  </button>
                  <button onClick={() => removeRecurring(item.id)} className="text-sm text-red-600">
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
