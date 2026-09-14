"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { businessProfileStore, clientsStore, receiptsStore, invoicesStore, recurringExpensesStore } from "@/lib/storage";

function ScanIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V6a2 2 0 0 1 2-2h2M4 16v2a2 2 0 0 0 2 2h2M20 8V6a2 2 0 0 0-2-2h-2M20 16v2a2 2 0 0 1-2 2h-2" />
      <circle cx="12" cy="12" r="3.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Dashboard() {
  const [counts, setCounts] = useState({ clients: 0, receipts: 0, invoices: 0, monthTotal: 0, monthVat: 0 });
  const [overdueCount, setOverdueCount] = useState(0);
  const [showOverdueBanner, setShowOverdueBanner] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [dueRecurringCount, setDueRecurringCount] = useState(0);
  const [recurringBannerDismissed, setRecurringBannerDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [clients, receipts, invoices, profile, recurring] = await Promise.all([
        clientsStore.all(),
        receiptsStore.all(),
        invoicesStore.all(),
        businessProfileStore.get(),
        recurringExpensesStore.all(),
      ]);
      if (cancelled) return;
      // Compare "YYYY-MM" string prefixes rather than Date object fields --
      // constructing a Date from a bare date string and reading local
      // month/year back out is a real source of off-by-one-day bugs
      // whenever the viewer's timezone offset isn't exactly zero.
      const thisMonth = new Date().toISOString().slice(0, 7);
      const monthReceipts = receipts.filter((r) => r.date.slice(0, 7) === thisMonth);
      setCounts({
        clients: clients.length,
        receipts: receipts.length,
        invoices: invoices.length,
        monthTotal: monthReceipts.reduce((s, r) => s + r.amount, 0),
        monthVat: monthReceipts.reduce((s, r) => s + r.vatAmount, 0),
      });
      const today = new Date().toISOString().slice(0, 10);
      const overdue = invoices.filter((i) => !i.paid && i.dueDate && i.dueDate < today);
      setOverdueCount(overdue.length);
      setShowOverdueBanner(profile.showOverdueReminders && overdue.length > 0);
      setDueRecurringCount(recurring.filter((r) => r.active && r.nextDueDate <= today).length);
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

      {showOverdueBanner && !bannerDismissed && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <span>
            You have {overdueCount} overdue {overdueCount === 1 ? "invoice" : "invoices"} — worth checking if they&apos;ve been paid.
          </span>
          <div className="flex items-center gap-3">
            <Link href="/invoices" className="font-medium underline">Review</Link>
            <button onClick={() => setBannerDismissed(true)} className="text-amber-600" aria-label="Dismiss">✕</button>
          </div>
        </div>
      )}

      {dueRecurringCount > 0 && !recurringBannerDismissed && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <span>
            {dueRecurringCount} recurring {dueRecurringCount === 1 ? "expense is" : "expenses are"} due — log {dueRecurringCount === 1 ? "it" : "them"} so they&apos;re not forgotten.
          </span>
          <div className="flex items-center gap-3">
            <Link href="/recurring" className="font-medium underline">Review</Link>
            <button onClick={() => setRecurringBannerDismissed(true)} className="text-amber-600" aria-label="Dismiss">✕</button>
          </div>
        </div>
      )}

      <Link
        href="/scan"
        className="flex items-center gap-4 rounded-xl border-2 border-neutral-900 bg-neutral-900 p-6 text-white shadow-sm transition hover:bg-neutral-800"
      >
        <ScanIcon />
        <div className="flex-1">
          <div className="text-lg font-semibold">What do you want to scan or add?</div>
          <div className="mt-1 text-sm text-neutral-300">Point your camera at a receipt, invoice, or document.</div>
        </div>
        <span className="text-2xl">&rarr;</span>
      </Link>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link href="/receipts" className="rounded-lg border bg-white px-4 py-3 text-center text-sm font-medium text-neutral-900 shadow-sm transition hover:shadow-md">
          + Add a receipt manually
        </Link>
        <Link href="/invoices/new" className="rounded-lg border bg-white px-4 py-3 text-center text-sm font-medium text-neutral-900 shadow-sm transition hover:shadow-md">
          + Create an invoice
        </Link>
        <Link href="/clients" className="rounded-lg border bg-white px-4 py-3 text-center text-sm font-medium text-neutral-900 shadow-sm transition hover:shadow-md">
          + Add a client or company
        </Link>
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

      <div className="flex flex-wrap gap-4">
        <Link href="/files" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600">
          📁 Browse your file library &rarr;
        </Link>
        <Link href="/recurring" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600">
          🔁 Recurring expenses &rarr;
        </Link>
      </div>

      <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <h2 className="font-semibold">This month so far</h2>
        <div className="mt-3 grid grid-cols-3 gap-4">
          <div>
            <div className="text-2xl font-bold">£{counts.monthTotal.toFixed(2)}</div>
            <div className="text-sm text-neutral-600">Spent excl. VAT</div>
          </div>
          <div>
            <div className="text-2xl font-bold">£{counts.monthVat.toFixed(2)}</div>
            <div className="text-sm text-neutral-600">VAT on those costs</div>
          </div>
          <div>
            <div className="text-2xl font-bold">£{(counts.monthTotal + counts.monthVat).toFixed(2)}</div>
            <div className="text-sm text-neutral-600">Spent incl. VAT</div>
          </div>
        </div>
        <Link href="/expenses" className="mt-4 inline-block text-sm font-medium text-blue-600">
          View full expense summary &rarr;
        </Link>
      </div>
    </div>
  );
}
