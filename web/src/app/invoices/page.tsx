"use client";

import Link from "next/link";
import ScanOrAdd from "@/components/ScanOrAdd";
import { useEffect, useMemo, useState } from "react";
import { BusinessProfile, Client, CreditNote, Invoice, businessProfileStore, clientsStore, creditNotesStore, invoicesStore } from "@/lib/storage";
import { downloadCsv } from "@/lib/exportCsv";
import { computeInvoiceTotals } from "@/lib/vat";
import { INVOICE_STATUS_KINDS, INVOICE_STATUS_LABELS, InvoiceStatus, displayInvoiceNumber, invoiceStatusBadgeClass, invoiceStatusLabel, isOverdue } from "@/lib/invoiceStatus";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [filterMinTotal, setFilterMinTotal] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | InvoiceStatus | "overdue">("");
  const [filterTag, setFilterTag] = useState("");

  useEffect(() => {
    Promise.all([invoicesStore.all(), clientsStore.all(), businessProfileStore.get(), creditNotesStore.all()]).then(([inv, c, biz, cn]) => {
      setInvoices(inv);
      setClients(c);
      setProfile(biz);
      setCreditNotes(cn);
      setLoading(false);
    });
  }, []);

  // Gross (incl. VAT) -- what the client actually owes, matching the
  // "Amount due" figure on the invoice itself, not just the line items'
  // raw subtotal.
  function total(inv: Invoice) {
    return computeInvoiceTotals(inv.items, profile?.vatRegistered ?? false).total;
  }

  const creditNotesByInvoice = useMemo(() => {
    const map = new Map<string, CreditNote[]>();
    for (const c of creditNotes) map.set(c.invoiceId, [...(map.get(c.invoiceId) ?? []), c]);
    return map;
  }, [creditNotes]);

  function credited(inv: Invoice) {
    return (creditNotesByInvoice.get(inv.id) ?? []).reduce((s, c) => s + c.amount, 0);
  }

  // Net of credit notes -- the same figure the detail page shows as
  // "Amount due", so the list never claims a client owes more than
  // the invoice itself says.
  function netTotal(inv: Invoice) {
    return total(inv) - credited(inv);
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

  // "Mark as sent" isn't a quick inline action any more -- it now
  // assigns the real invoice number, which needs the confirmation panel
  // on the invoice's own page, not a one-tap flip from the list.
  // "Mark as paid" from sent has no such requirement, so it stays quick.
  async function quickMarkPaid(inv: Invoice) {
    setInvoices((prev) => prev.map((i) => (i.id === inv.id ? { ...i, status: "paid" } : i)));
    try {
      await invoicesStore.update(inv.id, { status: "paid" });
    } catch (err) {
      setInvoices((prev) => prev.map((i) => (i.id === inv.id ? { ...i, status: inv.status } : i)));
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
      if (filterStatus === "overdue" && !isOverdue(inv.status, inv.dueDate)) return false;
      if (filterStatus !== "" && filterStatus !== "overdue" && inv.status !== filterStatus) return false;
      if (filterTag && !inv.tags.includes(filterTag)) return false;
      return true;
    });
  }, [invoices, filterFrom, filterTo, filterClientId, filterMinTotal, filterSearch, filterStatus, filterTag, profile]);

  function exportInvoices() {
    downloadCsv(
      `invoices-${new Date().toISOString().slice(0, 10)}.csv`,
      filteredInvoices.map((inv) => ({
        number: inv.status === "draft" ? "" : inv.number,
        date: inv.date,
        due_date: inv.dueDate ?? "",
        client: clientName(inv.clientId),
        total: netTotal(inv).toFixed(2),
        credited: credited(inv).toFixed(2),
        status: invoiceStatusLabel(inv.status, isOverdue(inv.status, inv.dueDate)),
        notes: inv.notes,
      }))
    );
  }

  const hasActiveFilters = filterFrom || filterTo || filterClientId || filterMinTotal || filterSearch || filterStatus || filterTag;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="mt-1 text-neutral-600">Create and revisit the invoices you have sent.</p>
        </div>
        <div className="flex items-start gap-2">
          {invoices.length > 0 && (
            <button onClick={exportInvoices} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700">
              Export CSV
            </button>
          )}
          <ScanOrAdd scanHref="/invoices/new?scan=1" scanLabel="Scan an invoice" addHref="/invoices/new" />
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
          <select className="rounded-lg border px-3 py-2 text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as "" | InvoiceStatus | "overdue")}>
            <option value="">All statuses</option>
            {INVOICE_STATUS_KINDS.map((k) => <option key={k} value={k}>{INVOICE_STATUS_LABELS[k]}</option>)}
            <option value="overdue">Overdue</option>
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
            onClick={() => { setFilterFrom(""); setFilterTo(""); setFilterClientId(""); setFilterMinTotal(""); setFilterSearch(""); setFilterStatus(""); setFilterTag(""); }}
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
                "No invoices yet. Scan one you've sent before to copy it, or add one manually."
              )}
            </p>
          )}
          {filteredInvoices.map((inv) => {
            const overdue = isOverdue(inv.status, inv.dueDate);
            const notes = creditNotesByInvoice.get(inv.id) ?? [];
            const creditedAmount = credited(inv);
            return (
              <div key={inv.id} className="flex items-center justify-between rounded-xl border bg-white p-4 text-neutral-900 shadow-sm">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    {displayInvoiceNumber(inv)} · {clientName(inv.clientId)}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${invoiceStatusBadgeClass(inv.status, overdue)}`}>
                      {invoiceStatusLabel(inv.status, overdue)}
                    </span>
                    {notes.length > 0 && (
                      <span title="Has a credit note" className="rounded-sm bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800">
                        CN
                      </span>
                    )}
                    {inv.status === "sent" && (
                      <button onClick={() => quickMarkPaid(inv)} className="text-xs font-medium text-blue-600 underline">
                        Mark as paid
                      </button>
                    )}
                  </div>
                  <div className="text-sm text-neutral-500">
                    {inv.date} · £{netTotal(inv).toFixed(2)}
                    {notes.length > 0 && (
                      <>
                        {" "}<span className="line-through">£{total(inv).toFixed(2)}</span> after £{creditedAmount.toFixed(2)} credited
                      </>
                    )}
                    {inv.dueDate && ` · due ${inv.dueDate}`}
                  </div>
                  {notes.map((c) => (
                    <div key={c.id} className="pl-4 text-xs text-neutral-500">
                      Credit note {c.date} · −£{c.amount.toFixed(2)}{c.reason && ` · ${c.reason}`}
                    </div>
                  ))}
                  {inv.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {inv.tags.map((t) => (
                        <span key={t} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  <Link href={`/invoices/${inv.id}`} className="text-sm font-medium text-blue-600">
                    {inv.status === "draft" ? "Continue draft" : "View / print"}
                  </Link>
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
