"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clientsStore, receiptsStore, invoicesStore } from "@/lib/storage";

export default function Dashboard() {
  const [counts, setCounts] = useState({ clients: 0, receipts: 0, invoices: 0, monthTotal: 0, monthVat: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [clients, receipts, invoices] = await Promise.all([
        clientsStore.all(),
        receiptsStore.all(),
        invoicesStore.all(),
      ]);
      if (cancelled) return;
      const now = new Date();
      const monthReceipts = receipts.filter((r) => {
        const d = new Date(r.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      setCounts({
        clients: clients.length,
        receipts: receipts.length,
        invoices: invoices.length,
        monthTotal: monthReceipts.reduce((s, r) => s + r.amount, 0),
        monthVat: monthReceipts.reduce((s, r) => s + r.vatAmount, 0),
      });
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = [
    { label: "Clients & companies", value: counts.clients, href: "/clients" },
    { label: "Saved receipts", value: counts.receipts, href: "/receipts" },
    { label: "Invoices created", value: counts.invoices, href: "/invoices" },
  ];

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-neutral-600">
          Scan receipts, create invoices and see your monthly costs at a glance.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm transition hover:shadow-md"
          >
            <div className="text-3xl font-bold">{c.value}</div>
            <div className="mt-1 text-sm text-neutral-600">{c.label}</div>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <h2 className="font-semibold">This month so far</h2>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-2">
          <div>
            <div className="text-2xl font-bold">£{counts.monthTotal.toFixed(2)}</div>
            <div className="text-sm text-neutral-600">Total spent</div>
          </div>
          <div>
            <div className="text-2xl font-bold">£{counts.monthVat.toFixed(2)}</div>
            <div className="text-sm text-neutral-600">VAT on those costs</div>
          </div>
        </div>
        <Link href="/expenses" className="mt-4 inline-block text-sm font-medium text-blue-600">
          View full expense summary &rarr;
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/receipts" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          + Scan a receipt
        </Link>
        <Link href="/invoices/new" className="rounded-lg border px-4 py-2 text-sm font-medium">
          + Create an invoice
        </Link>
        <Link href="/clients" className="rounded-lg border px-4 py-2 text-sm font-medium">
          + Add a client or company
        </Link>
      </div>
    </div>
  );
}
