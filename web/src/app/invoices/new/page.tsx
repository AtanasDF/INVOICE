"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Client, InvoiceItem, clientsStore, invoicesStore } from "@/lib/storage";

export default function NewInvoicePage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [number, setNumber] = useState(() => `INV-${Date.now().toString().slice(-6)}`);
  const [items, setItems] = useState<InvoiceItem[]>([{ description: "", quantity: 1, unitPrice: 0 }]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    clientsStore.all().then(setClients);
  }, []);

  function updateItem(idx: number, patch: Partial<InvoiceItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function addLine() {
    setItems((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0 }]);
  }

  function removeLine(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const inv = await invoicesStore.add({ clientId, date, number, items, notes });
      router.push(`/invoices/${inv.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save invoice.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">New invoice</h1>

      <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <select className="w-full rounded-lg border px-3 py-2" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Select a client or company</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <input type="date" className="rounded-lg border px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} />
          <input className="rounded-lg border px-3 py-2" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Invoice number" />
        </div>

        <div className="space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2">
              <input
                className="col-span-6 rounded-lg border px-3 py-2"
                placeholder="Description (e.g. Monthly work, 12-30 June)"
                value={it.description}
                onChange={(e) => updateItem(idx, { description: e.target.value })}
              />
              <input
                className="col-span-2 rounded-lg border px-3 py-2"
                placeholder="Qty"
                value={it.quantity}
                onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
              />
              <input
                className="col-span-3 rounded-lg border px-3 py-2"
                placeholder="Unit price"
                value={it.unitPrice}
                onChange={(e) => updateItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
              />
              <button onClick={() => removeLine(idx)} className="col-span-1 text-sm text-red-600">✕</button>
            </div>
          ))}
          <button onClick={addLine} className="text-sm font-medium text-blue-600">+ Add line</button>
        </div>

        <textarea className="w-full rounded-lg border px-3 py-2" placeholder="Notes (payment details, etc.)" value={notes} onChange={(e) => setNotes(e.target.value)} />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-between border-t pt-3">
          <div className="text-lg font-bold">Total: £{total.toFixed(2)}</div>
          <button onClick={save} disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}
