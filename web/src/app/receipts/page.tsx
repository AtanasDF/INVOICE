"use client";

import { useEffect, useRef, useState } from "react";
import { Client, Receipt, clientsStore, receiptsStore, uid } from "@/lib/storage";

const CATEGORIES = ["Fuel", "Supplies", "Equipment", "Travel", "Meals", "Other"];

export default function ReceiptsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [clientId, setClientId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setClients(clientsStore.all());
    setReceipts(receiptsStore.all());
  }, []);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  function addReceipt(e: React.FormEvent) {
    e.preventDefault();
    if (!amount) return;
    const next: Receipt[] = [
      ...receipts,
      {
        id: uid(),
        clientId,
        date,
        vendor,
        category,
        amount: parseFloat(amount) || 0,
        vatAmount: parseFloat(vatAmount) || 0,
        imageDataUrl,
      },
    ];
    setReceipts(next);
    receiptsStore.save(next);
    setVendor("");
    setAmount("");
    setVatAmount("");
    setImageDataUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeReceipt(id: string) {
    const next = receipts.filter((r) => r.id !== id);
    setReceipts(next);
    receiptsStore.save(next);
  }

  function clientName(id: string) {
    return clients.find((c) => c.id === id)?.name || "No client";
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Receipts</h1>
        <p className="mt-1 text-neutral-600">
          Scan or upload a receipt, tag it with a client and category, and it is saved for later.
        </p>
      </div>

      <form onSubmit={addReceipt} className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFile}
          className="block text-sm"
        />
        {imageDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageDataUrl} alt="Receipt preview" className="h-32 rounded-lg border object-cover" />
        )}
        <select className="w-full rounded-lg border px-3 py-2" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">No client / general expense</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <input type="date" className="rounded-lg border px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} />
          <select className="rounded-lg border px-3 py-2" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <input className="w-full rounded-lg border px-3 py-2" placeholder="Vendor / shop name" value={vendor} onChange={(e) => setVendor(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <input className="rounded-lg border px-3 py-2" placeholder="Amount (£)" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          <input className="rounded-lg border px-3 py-2" placeholder="VAT amount (£)" value={vatAmount} onChange={(e) => setVatAmount(e.target.value)} inputMode="decimal" />
        </div>
        <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">Save receipt</button>
      </form>

      <div className="space-y-3">
        {receipts.length === 0 && <p className="text-sm text-neutral-500">No receipts saved yet.</p>}
        {receipts
          .slice()
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                {r.imageDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.imageDataUrl} alt="" className="h-12 w-12 rounded object-cover" />
                )}
                <div>
                  <div className="font-medium">{r.vendor || r.category} · £{r.amount.toFixed(2)}</div>
                  <div className="text-sm text-neutral-500">{r.date} · {r.category} · {clientName(r.clientId)}</div>
                </div>
              </div>
              <button onClick={() => removeReceipt(r.id)} className="text-sm text-red-600">Remove</button>
            </div>
          ))}
      </div>
    </div>
  );
}
