"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Client, InvoiceItem, clientsStore, invoicesStore } from "@/lib/storage";
import DocumentCapture, { CapturedFile } from "@/components/DocumentCapture";

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

type ScanLineItem = { description: string; quantity: number; unitPrice: number };
type ScanApiResult = {
  date: string | null;
  lineItems: ScanLineItem[];
  notes: string | null;
};

export default function NewInvoicePage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => addDays(new Date().toISOString().slice(0, 10), 30));
  const [dueDateManual, setDueDateManual] = useState(false);
  const [paymentTerms, setPaymentTerms] = useState("");
  const [number, setNumber] = useState(() => `INV-${Date.now().toString().slice(-6)}`);
  const [items, setItems] = useState<InvoiceItem[]>([{ description: "", quantity: 1, unitPrice: 0 }]);
  const [notes, setNotes] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCapture, setShowCapture] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    clientsStore.all().then(setClients);
  }, []);

  const billableClients = clients.filter((c) => c.kind === "client");

  function onClientChange(id: string) {
    setClientId(id);
    const client = clients.find((c) => c.id === id);
    if (client?.paymentTerms && !paymentTerms) setPaymentTerms(client.paymentTerms);
  }

  function onDateChange(value: string) {
    setDate(value);
    if (!dueDateManual) setDueDate(addDays(value, 30));
  }

  function updateItem(idx: number, patch: Partial<InvoiceItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function addLine() {
    setItems((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0 }]);
  }

  function removeLine(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onDocumentCaptured(file: CapturedFile) {
    setShowCapture(false);
    setScanning(true);
    setScanError(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: file.dataUrl }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Scan failed.");
      const result = body.result as ScanApiResult;

      if (result.date) onDateChange(result.date);
      if (result.notes) setNotes((prev) => prev || result.notes || "");
      if (result.lineItems?.length) {
        setItems(result.lineItems.map((li) => ({ description: li.description, quantity: li.quantity, unitPrice: li.unitPrice })));
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  }

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const inv = await invoicesStore.add({
        clientId,
        date,
        number,
        items,
        notes,
        dueDate: dueDate || null,
        paymentTerms,
        paid: false,
        tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
      });
      router.push(`/invoices/${inv.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save invoice.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {showCapture && (
        <DocumentCapture
          onCapture={onDocumentCaptured}
          onClose={() => setShowCapture(false)}
        />
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">New invoice</h1>
        <button
          onClick={() => setShowCapture(true)}
          disabled={scanning}
          className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700 disabled:opacity-50"
        >
          {scanning ? "Reading document…" : "📷 Scan or attach a document"}
        </button>
      </div>
      {scanError && <p className="text-sm text-red-600">{scanError}</p>}
      <p className="text-xs text-neutral-500 -mt-4">
        Scanning fills in the date, line items, and notes from a source document (a timesheet, delivery note,
        etc.) — the client is always your own choice below, never guessed.
      </p>

      <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <select className="w-full rounded-lg border px-3 py-2" value={clientId} onChange={(e) => onClientChange(e.target.value)}>
          <option value="">Select a client or company</option>
          {billableClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-neutral-500">Invoice date</label>
            <input type="date" className="w-full rounded-lg border px-3 py-2" value={date} onChange={(e) => onDateChange(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-500">Due date</label>
            <input
              type="date"
              className="w-full rounded-lg border px-3 py-2"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                setDueDateManual(true);
              }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input className="rounded-lg border px-3 py-2" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Invoice number" />
          <input className="rounded-lg border px-3 py-2" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Payment terms (e.g. 30 days)" />
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
        <input
          className="w-full rounded-lg border px-3 py-2"
          placeholder="Tags, comma separated (optional, e.g. Site A, Q3 job)"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
        />

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
