"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Client, RecurringExpense, businessProfileStore, clientsStore, receiptsStore, recurringExpensesStore } from "@/lib/storage";
import { CATEGORIES, Category, effectiveCategories } from "@/lib/categories";
import { addMonths, nextDueFromDay } from "@/lib/recurrence";
import ClearFormButton from "@/components/ClearFormButton";

function RecurringTabs() {
  return (
    <div className="flex rounded-lg border text-sm w-fit">
      <button className="px-4 py-1.5 bg-neutral-900 text-white">Expenses</button>
      <Link href="/recurring/invoices" className="px-4 py-1.5 text-neutral-600">Invoices</Link>
    </div>
  );
}

export default function RecurringExpensesPage() {
  const [items, setItems] = useState<RecurringExpense[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [categories, setCategories] = useState<string[]>([...CATEGORIES]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  // Total paid (VAT included, matching what's on the bill) -- net is
  // derived from total - VAT below, never typed directly. See the same
  // fix on the Receipts page for why.
  const [totalAmount, setTotalAmount] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([recurringExpensesStore.all(), clientsStore.all(), businessProfileStore.get()]).then(([r, c, profile]) => {
      setItems(r);
      setClients(c);
      const active = effectiveCategories(profile.customCategories);
      setCategories(active);
      setCategory(active[0]);
      setLoading(false);
    });
  }, []);

  const suppliers = clients.filter((c) => c.kind === "supplier" && !c.archived);
  const today = new Date().toISOString().slice(0, 10);

  function supplierName(id: string) {
    return clients.find((c) => c.id === id)?.name || "";
  }

  const filled = !!(description || totalAmount || vatAmount || supplierId || dayOfMonth !== "1" || category !== categories[0]);

  function clearForm() {
    setDescription("");
    setTotalAmount("");
    setVatAmount("");
    setSupplierId("");
    setDayOfMonth("1");
    setCategory(categories[0]);
    setError(null);
  }

  async function addRecurring(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !totalAmount) return;
    setError(null);
    setSaving(true);
    try {
      const day = Math.min(28, Math.max(1, parseInt(dayOfMonth, 10) || 1));
      const total = parseFloat(totalAmount) || 0;
      const vat = parseFloat(vatAmount) || 0;
      const created = await recurringExpensesStore.add({
        description,
        category,
        amount: Math.max(0, total - vat),
        vatAmount: vat,
        supplierId,
        dayOfMonth: day,
        nextDueDate: nextDueFromDay(day),
        active: true,
      });
      setItems((prev) => [...prev, created].sort((a, b) => (a.nextDueDate < b.nextDueDate ? -1 : 1)));
      setDescription("");
      setTotalAmount("");
      setVatAmount("");
      setSupplierId("");
      setDayOfMonth("1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function logNow(item: RecurringExpense) {
    setError(null);
    try {
      await receiptsStore.add({
        clientId: item.supplierId,
        date: today,
        vendor: item.description,
        category: item.category || "Other",
        amount: item.amount,
        vatAmount: item.vatAmount,
        originalAmount: null,
        originalVatAmount: null,
        originalCurrency: null,
        fxRate: null,
        imageDataUrl: null,
        notes: "Logged from a recurring expense reminder.",
        starred: false,
        needsReview: false,
        warrantyMonths: null,
        tags: [],
        lineItems: [],
      });
      const next = addMonths(item.nextDueDate, 1);
      await recurringExpensesStore.update(item.id, { nextDueDate: next });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, nextDueDate: next } : i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log this expense.");
    }
  }

  async function toggleActive(item: RecurringExpense) {
    const next = !item.active;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, active: next } : i)));
    try {
      await recurringExpensesStore.update(item.id, { active: next });
    } catch (err) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, active: !next } : i)));
      setError(err instanceof Error ? err.message : "Could not update.");
    }
  }

  async function removeRecurring(id: string) {
    setError(null);
    try {
      await recurringExpensesStore.remove(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove.");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Recurring</h1>
        <p className="mt-1 text-neutral-600">
          Things like monthly insurance or subscriptions — a reminder so they don&apos;t get forgotten.
        </p>
      </div>

      <RecurringTabs />

      <form onSubmit={addRecurring} className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <input
          className="w-full rounded-lg border px-3 py-2"
          placeholder="Description (e.g. Van insurance)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <select className="w-full rounded-lg border px-3 py-2" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">No supplier / general expense</option>
          {suppliers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="grid grid-cols-3 gap-3">
          <select className="rounded-lg border px-3 py-2" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className="rounded-lg border px-3 py-2" placeholder="Total (£, incl. VAT)" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} inputMode="decimal" />
          <input className="rounded-lg border px-3 py-2" placeholder="Of which VAT (£, optional)" value={vatAmount} onChange={(e) => setVatAmount(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <label className="text-xs text-neutral-500">Day of month it&apos;s due (1-28)</label>
          <input
            type="number"
            min={1}
            max={28}
            className="w-24 rounded-lg border px-3 py-2"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <button disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "Saving…" : "Add recurring expense"}
          </button>
          <ClearFormButton onClear={clearForm} disabled={saving || !filled} />
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-3">
          {items.length === 0 && <p className="text-sm text-neutral-500">No recurring expenses set up yet.</p>}
          {items.map((item) => {
            const due = item.nextDueDate <= today;
            return (
              <div key={item.id} className="flex items-center justify-between rounded-xl border bg-white p-4 text-neutral-900 shadow-sm">
                <div>
                  <div className={`font-medium ${!item.active ? "text-neutral-400 line-through" : ""}`}>
                    {item.description}
                  </div>
                  <div className="text-sm text-neutral-500">
                    £{(item.amount + item.vatAmount).toFixed(2)} · {item.category}{item.supplierId ? ` · ${supplierName(item.supplierId)}` : ""}
                    {" · "}
                    {item.active ? (due ? <span className="font-medium text-amber-700">Due {item.nextDueDate}</span> : `Next: ${item.nextDueDate}`) : "Paused"}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {item.active && due && (
                    <button onClick={() => logNow(item)} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white">
                      Log it
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
