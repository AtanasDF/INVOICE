"use client";

import Link from "next/link";
import { money } from "@/lib/money";
import ScanOrAdd from "@/components/ScanOrAdd";
import { useEffect, useMemo, useState } from "react";
import { BusinessProfile, Client, CreditNote, Invoice, InvoicePayment, businessProfileStore, clientsStore, creditNotesStore, invoicesStore, paymentsStore } from "@/lib/storage";
import { invoiceBalance, invoiceVat } from "@/lib/invoiceBalance";
import { creditOffDue, invoiceCharge } from "@/lib/cis";
import { downloadCsv } from "@/lib/exportCsv";
import { INVOICE_STATUS_KINDS, INVOICE_STATUS_LABELS, InvoiceStatus, displayInvoiceNumber, invoiceStatusBadgeClass, invoiceStatusLabel, isOverdue } from "@/lib/invoiceStatus";
import Tip from "@/components/Tip";
import { celebratePaid } from "@/components/PaidCelebration";
import { loadFailed, saveFailed } from "@/lib/errorText";
import { todayISO } from "@/lib/today";
import { shortDate } from "@/lib/dates";

type StatusFilter = "" | InvoiceStatus | "overdue" | "to_receive";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [filterMinTotal, setFilterMinTotal] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("");
  const [filterTag, setFilterTag] = useState("");

  useEffect(() => {
    Promise.all([invoicesStore.all(), clientsStore.all(), businessProfileStore.get(), creditNotesStore.all(), paymentsStore.all()])
      .then(([inv, c, biz, cn, pay]) => {
        setInvoices(inv);
        setClients(c);
        setProfile(biz);
        setCreditNotes(cn);
        setPayments(pay);
      })
      .catch((err) => setError(loadFailed(err, "your invoices")))
      .finally(() => setLoading(false));
  }, []);

  // Gross (incl. VAT) less any CIS the contractor keeps back -- what the
  // client actually pays, matching the "Amount due" figure on the invoice
  // itself, not just the line items' raw subtotal.
  function charge(inv: Invoice) {
    return invoiceCharge(inv, invoiceVat(inv, profile?.vatRegistered ?? false));
  }

  function total(inv: Invoice) {
    return charge(inv).due;
  }

  // CIS kept back on what's still invoiced: a credit note cancels its share.
  function cis(inv: Invoice) {
    const c = charge(inv);
    return c.total > 0 ? Math.round(c.cis * Math.max(0, 1 - credited(inv) / c.total) * 100) / 100 : 0;
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
    return Math.max(0, Math.round((total(inv) - creditOffDue(charge(inv), credited(inv))) * 100) / 100);
  }

  function paidSoFar(inv: Invoice) {
    return payments.filter((p) => p.invoiceId === inv.id).reduce((s, p) => s + p.amount, 0);
  }

  function balance(inv: Invoice) {
    return invoiceBalance({ total: total(inv), credited: creditOffDue(charge(inv), credited(inv)), paid: paidSoFar(inv), status: inv.status });
  }

  // A supplier appears once it has an invoice (from a quote to them).
  const billableClients = useMemo(() => clients.filter((c) => c.kind === "client" || invoices.some((i) => i.clientId === c.id)), [clients, invoices]);

  function clientName(id: string) {
    return clients.find((c) => c.id === id)?.name || "No client";
  }

  // Deleting is the one thing here that can't be undone, and Remove sits a
  // thumb's width from View on a phone.
  async function removeInvoice(inv: Invoice) {
    const what = inv.status === "draft" ? "this draft" : `invoice ${displayInvoiceNumber(inv)}`;
    if (!window.confirm(`Remove ${what}? It won't be in your records any more, and this can't be undone.`)) return;
    const id = inv.id;
    setError(null);
    try {
      await invoicesStore.remove(id);
      setInvoices((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(saveFailed(err, "Could not remove invoice."));
    }
  }

  // "Mark as sent" isn't a quick inline action any more -- it now
  // assigns the real invoice number, which needs the confirmation panel
  // on the invoice's own page, not a one-tap flip from the list.
  // "Mark as paid" records a payment of whatever is still owed (read
  // fresh, so another tab's payment counts), so the payments add up. An
  // invoice marked part-paid by hand before payments existed is just marked
  // paid: its balance is unknown.
  const [marking, setMarking] = useState<string[]>([]);
  async function quickMarkPaid(inv: Invoice) {
    if (marking.includes(inv.id)) return;
    setMarking((m) => [...m, inv.id]);
    setError(null);
    try {
      const [pays, notes] = await Promise.all([paymentsStore.forInvoice(inv.id), creditNotesStore.forInvoice(inv.id)]);
      const legacy = inv.status === "partial" && pays.length === 0;
      const due = legacy
        ? 0
        : invoiceBalance({ total: total(inv), credited: creditOffDue(charge(inv), notes.reduce((s, c) => s + c.amount, 0)), paid: pays.reduce((s, p) => s + p.amount, 0), status: inv.status });
      let all = pays;
      if (due > 0) {
        const added = await paymentsStore.add({ invoiceId: inv.id, date: todayISO(), amount: due, method: null, note: "Marked as paid" });
        all = [...pays, added];
      }
      setPayments((prev) => [...prev.filter((p) => p.invoiceId !== inv.id), ...all]);
      await invoicesStore.update(inv.id, { status: "paid" });
      setInvoices((prev) => prev.map((i) => (i.id === inv.id ? { ...i, status: "paid" } : i)));
      celebratePaid({ amount: all.reduce((s, p) => s + p.amount, 0), from: clients.find((c) => c.id === inv.clientId)?.name, number: inv.number });
    } catch (err) {
      setError(saveFailed(err, "Could not update invoice."));
    } finally {
      setMarking((m) => m.filter((id) => id !== inv.id));
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
      if (!isNaN(minTotal) && invoiceCharge(inv, invoiceVat(inv, vatRegistered)).due < minTotal) return false;
      if (search && !inv.number.toLowerCase().includes(search)) return false;
      if (filterStatus === "overdue") {
        if (!isOverdue(inv.status, inv.dueDate)) return false;
      } else if (filterStatus === "to_receive") {
        if (inv.status !== "sent" && inv.status !== "partial") return false;
      } else if (filterStatus && inv.status !== filterStatus) return false;
      if (filterTag && !inv.tags.includes(filterTag)) return false;
      return true;
    });
  }, [invoices, filterFrom, filterTo, filterClientId, filterMinTotal, filterSearch, filterStatus, filterTag, profile]);

  function exportInvoices() {
    downloadCsv(
      `invoices-${todayISO()}.csv`,
      filteredInvoices.map((inv) => ({
        number: inv.status === "draft" ? "" : inv.number,
        date: inv.date,
        due_date: inv.dueDate ?? "",
        client: clientName(inv.clientId),
        total: netTotal(inv).toFixed(2),
        cis_deducted: cis(inv).toFixed(2),
        credited: credited(inv).toFixed(2),
        paid: paidSoFar(inv).toFixed(2),
        balance: balance(inv).toFixed(2),
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
              Download for a spreadsheet
            </button>
          )}
          <ScanOrAdd scanHref="/invoices/new?scan=1" scanLabel="Scan an invoice" addHref="/invoices/new" />
        </div>
      </div>

      <Tip id="invoices-scan">
        Tip: <strong>Scan an invoice</strong> you&apos;ve sent before and it&apos;s copied as a new one — customer, lines and
        terms — dated today.
      </Tip>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

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
          <select className="rounded-lg border px-3 py-2 text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}>
            <option value="">All statuses</option>
            <option value="to_receive">To receive (owed to me)</option>
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
          {filteredInvoices.length === 0 && !error && (
            <p className="text-sm text-neutral-500">
              {hasActiveFilters ? (
                "No invoices match these filters."
              ) : (
                "No invoices yet. Scan one you've sent before to copy it, or add one by hand."
              )}
            </p>
          )}
          {filteredInvoices.map((inv) => {
            const overdue = isOverdue(inv.status, inv.dueDate);
            const notes = creditNotesByInvoice.get(inv.id) ?? [];
            const creditedAmount = credited(inv);
            return (
              <div key={inv.id} className="flex items-center justify-between gap-3 rounded-xl border bg-white p-4 text-neutral-900 shadow-sm">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 wrap-anywhere font-medium">
                    {displayInvoiceNumber(inv)} · {clientName(inv.clientId)}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${invoiceStatusBadgeClass(inv.status, overdue)}`}>
                      {invoiceStatusLabel(inv.status, overdue)}
                    </span>
                    {notes.length > 0 && (
                      <span title="Has a credit note" className="rounded-sm bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800">
                        CN
                      </span>
                    )}
                    {(inv.status === "sent" || inv.status === "partial") && (
                      <button onClick={() => quickMarkPaid(inv)} disabled={marking.includes(inv.id)} className="text-xs font-medium text-blue-600 underline disabled:opacity-50">
                        Mark as paid
                      </button>
                    )}
                  </div>
                  <div className="wrap-anywhere text-sm text-neutral-500">
                    {shortDate(inv.date)} · {money(netTotal(inv))}
                    {notes.length > 0 && (
                      <>
                        {" "}<span className="line-through">{money(total(inv))}</span> after {money(creditOffDue(charge(inv), creditedAmount))} credited
                      </>
                    )}
                    {paidSoFar(inv) > 0 && inv.status !== "paid" && ` · ${money(paidSoFar(inv))} paid, ${money(balance(inv))} still owed`}
                    {inv.dueDate && ` · due ${shortDate(inv.dueDate)}`}
                  </div>
                  {notes.map((c) => (
                    <div key={c.id} className="pl-4 text-xs text-neutral-500">
                      Credit note {shortDate(c.date)} · {money(-c.amount)}{c.reason && ` · ${c.reason}`}
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
                <div className="flex shrink-0 gap-3">
                  <Link href={`/invoices/${inv.id}`} className="text-sm font-medium text-blue-600">
                    {inv.status === "draft" ? "Continue draft" : "View / print"}
                  </Link>
                  <button onClick={() => removeInvoice(inv)} className="text-sm text-red-600">Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
