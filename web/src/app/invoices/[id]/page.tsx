"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Client, Invoice, clientsStore, invoicesStore } from "@/lib/storage";

export default function InvoiceViewPage() {
  const params = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const inv = await invoicesStore.get(params.id);
      if (cancelled) return;
      setInvoice(inv);
      if (inv) {
        const clients = await clientsStore.all();
        if (cancelled) return;
        setClient(clients.find((c) => c.id === inv.clientId) || null);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (!invoice) return <p className="text-sm text-neutral-500">Invoice not found.</p>;

  const total = invoice.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-end print:hidden">
        <button onClick={() => window.print()} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          Print / save as PDF
        </button>
      </div>

      <div className="rounded-xl border bg-white p-8 text-neutral-900 shadow-sm print:border-0 print:shadow-none">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Invoice {invoice.number}</h1>
            <p className="text-sm text-neutral-500">Date: {invoice.date}</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-sm font-medium text-neutral-500">Billed to</p>
          <p className="font-medium">{client?.name || "—"}</p>
          {client?.address && <p className="whitespace-pre-line text-sm text-neutral-600">{client.address}</p>}
          {client?.email && <p className="text-sm text-neutral-600">{client.email}</p>}
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-neutral-500">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Unit price</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it, idx) => (
              <tr key={idx} className="border-b">
                <td className="py-2">{it.description}</td>
                <td className="py-2 text-right">{it.quantity}</td>
                <td className="py-2 text-right">£{it.unitPrice.toFixed(2)}</td>
                <td className="py-2 text-right">£{(it.quantity * it.unitPrice).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="text-lg font-bold">Total: £{total.toFixed(2)}</div>
        </div>

        {invoice.notes && (
          <div className="mt-6 border-t pt-4 text-sm text-neutral-600">{invoice.notes}</div>
        )}
      </div>
    </div>
  );
}
