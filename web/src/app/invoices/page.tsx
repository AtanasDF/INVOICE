"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Client, Invoice, clientsStore, invoicesStore } from "@/lib/storage";

function total(inv: Invoice) {
  return inv.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    setInvoices(invoicesStore.all());
    setClients(clientsStore.all());
  }, []);

  function clientName(id: string) {
    return clients.find((c) => c.id === id)?.name || "No client";
  }

  function removeInvoice(id: string) {
    const next = invoices.filter((i) => i.id !== id);
    setInvoices(next);
    invoicesStore.save(next);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="mt-1 text-neutral-600">Create and revisit the invoices you have sent.</p>
        </div>
        <Link href="/invoices/new" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          + New invoice
        </Link>
      </div>

      <div className="space-y-3">
        {invoices.length === 0 && <p className="text-sm text-neutral-500">No invoices yet.</p>}
        {invoices
          .slice()
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .map((inv) => (
            <div key={inv.id} className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm">
              <div>
                <div className="font-medium">#{inv.number} · {clientName(inv.clientId)}</div>
                <div className="text-sm text-neutral-500">{inv.date} · £{total(inv).toFixed(2)}</div>
              </div>
              <div className="flex gap-3">
                <Link href={`/invoices/${inv.id}`} className="text-sm font-medium text-blue-600">View / print</Link>
                <button onClick={() => removeInvoice(inv.id)} className="text-sm text-red-600">Remove</button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
