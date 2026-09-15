"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BusinessProfile, Client, Invoice, businessProfileStore, clientsStore, invoicesStore } from "@/lib/storage";
import { downloadCsv } from "@/lib/exportCsv";
import { computeInvoiceTotals } from "@/lib/vat";

const today = () => new Date().toISOString().slice(0, 10);

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [filterMinTotal, setFilterMinTotal] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterPaid, setFilterPaid] = useState<"" | "paid" | "unpaid">("");
  const [filterTag, setFilterTag] = useState("");

  useEffect(() => {
    Promise.all([invoicesStore.all(), clientsStore.all(), businessProfileStore.get()]).then(([inv, c, biz]) => {
      setInvoices(inv);
      setClients(c);
      setProfile(biz);
      setLoading(false);
    });
  }, []);

  // Gross (incl. VAT) -- what the client actually owes, matching the
  // "Amount due" figure on the invoice itself, not just the line items'
  // raw subtotal.
  function total(inv: Invoice) {
    return computeInvoiceTotals(inv.items, profile?.vatRegistered ?? false).total;
  }

  const billableClients = useMemo(() => clients.filter((c) => c.kind === "client"), [clients]);

  function clientName(id: string) {
    return clients.find((c) => c.id === id)?.name || "No client";
  }

  async function removeInvoice(id: string) {
    setError(null);
    try {
      await invoicesStore.remove(id);
      setInvoices((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove invoice.");
    }
  }

  async function togglePaid(inv: Invoice) {
    const next = !inv.paid;
    setInvoices((prev) => prev.map((i) => (i.id === inv.id ? { ...i, paid: next } : i)));
    try {
      await invoicesStore.update(inv.id, { paid: next });
    } catch (err) {
      setInvoices((prev) => prev.map((i) => (i.id === inv.id ? { ...i, paid: !next } : i)));
      setError(err instanceof Error ? err.message : "Could not update invoice.");
    }
  }

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const inv of invoices) for (const t of inv.tags) set.add(t);
    return Array.from(set).sort();
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const minTotal = parseFloat(filterMinTotal);
    const search = filterSearch.trim().toLowerCase();
    const vatRegistered = profile?.vatRegistered ?? false;
    return invoices.filter((inv) => {
      if (filterFrom && inv.date < filterFrom) return false;
      if (filterTo && inv.date > filterTo) return false;
      if (filterClientId && inv.clientId !== filterClientId) return false;
      if (!isNaN(minTotal) && computeInvoiceTotals(inv.items, vatRegistered).total < minTotal) return false;
      if (search && !inv.number.toLowerCase().includes(search)) return false;
      if (filterPaid === "paid" && !inv.paid) return false;
      if (filterPaid === "unpaid" && inv.paid) return false;
      if (filterTag && !inv.tags.includes(filterTag)) return false;
      return true;
    });
  }, [invoices, filterFrom, filterTo, filterClientId, filterMinTotal, filterSearch, filterPaid, filterTag, profile]);

  function exportInvoices() {
    downloadCsv(
      `invoices-${new Date().toISOString().slice(0, 10)}.csv`,
      filteredInvoices.map((inv) => ({
        number: inv.number,
        date: inv.date,
        due_date: inv.dueDate ?? "",
        client: clientName(inv.clientId),
        total: total(inv).toFixed(2),
        paid: inv.paid ? "yes" : "no",
        notes: inv.notes,
      }))
    );
  }

  const hasActiveFilters = filterFrom || filterTo || filterClientId || filterMinTotal || filterSearch || filterPaid || filterTag;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="mt-1 text-neutral-600">Create and revisit the invoices you have sent.</p>
        </div>
        <div className="flex gap-2">
          {invoices.length > 0 && (
            <button onClick={exportInvoices} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700">
              Export CSV
            </button>
          )}
          <Link href="/invoices/new" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
            + New invoice
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <details className="rounded-xl border bg-white p-4 text-neutral-900 shadow-sm" open={!!hasActiveFilters}>
        <summary className="cursor-pointer text-sm font-medium">Filter</summary>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-6">
          <input
            className="rounded-lg border px-3 py-2 text-sm sm:col-span-2"
            placeholder="Search invoice #"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
          />
          <input type="date" className="rounded-lg border px-3 py-2 text-sm" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
          <input type="date" className="rounded-lg border px-3 py-2 text-sm" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
          <select className="rounded-lg border px-3 py-2 text-sm" value={filterClientId} onChange={(e) => setFilterClientId(e.target.value)}>
            <option value="">All clients</option>
            {billableClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm" value={filterPaid} onChange={(e) => setFilterPaid(e.target.value as "" | "paid" | "unpaid")}>
            <option value="">Paid or unpaid</option>
            <option value="paid">Paid only</option>
            <option value="unpaid">Unpaid only</option>
          </select>
          <input
            className="rounded-lg border px-3 py-2 text-sm"
            placeholder="Min total (£)"
            value={filterMinTotal}
            onChange={(e) => setFilterMinTotal(e.target.value)}
            inputMode="decimal"
          />
          {allTags.length > 0 && (
            <select className="rounded-lg border px-3 py-2 text-sm" value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
              <option value="">All tags</option>
              {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>
        {hasActiveFilters && (
          <button
            onClick={() => { setFilterFrom(""); setFilterTo(""); setFilterClientId(""); setFilterMinTotal(""); setFilterSearch(""); setFilterPaid(""); setFilterTag(""); }}
            className="mt-2 text-sm text-blue-600"
          >
            Clear filters
          </button>
        )}
      </details>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-3">
          {filteredInvoices.length === 0 && (
            <p className="text-sm text-neutral-500">
              {hasActiveFilters ? (
                "No invoices match these filters."
              ) : (
                <>No invoices yet. <Link href="/invoices/new" className="text-blue-600 underline">Create one</Link>.</>
              )}
            </p>
          )}
          {filteredInvoices.map((inv) => {
            const overdue = !inv.paid && inv.dueDate && inv.dueDate < today();
            return (
              <div key={inv.id} className="flex items-center justify-between rounded-xl border bg-white p-4 text-neutral-900 shadow-sm">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    #{inv.number} · {clientName(inv.clientId)}
                    <button
                      onClick={() => togglePaid(inv)}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        inv.paid ? "bg-green-100 text-green-800" : overdue ? "bg-red-100 text-red-800" : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {inv.paid ? "Paid" : overdue ? "Overdue" : "Unpaid"}
                    </button>
                  </div>
                  <div className="text-sm text-neutral-500">
                    {inv.date} · £{total(inv).toFixed(2)}
                    {inv.dueDate && ` · due ${inv.dueDate}`}
                  </div>
                  {inv.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {inv.tags.map((t) => (
                        <span key={t} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  <Link href={`/invoices/${inv.id}`} className="text-sm font-medium text-blue-600">View / print</Link>
                  <button onClick={() => removeInvoice(inv.id)} className="text-sm text-red-600">Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
