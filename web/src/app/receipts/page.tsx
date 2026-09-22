"use client";

import { useEffect, useMemo, useState } from "react";
import ScanOrAdd from "@/components/ScanOrAdd";
import { Client, DOCUMENT_DETAIL_LABELS, DocumentType, Receipt, businessProfileStore, clientsStore, receiptPagesStore, receiptsStore } from "@/lib/storage";
import { CATEGORIES, effectiveCategories } from "@/lib/categories";
import { downloadCsv } from "@/lib/exportCsv";
import { isPdfDataUrl } from "@/lib/fileType";
import { CURRENCIES, getFxRate } from "@/lib/fx";
import { money } from "@/lib/money";
import { bulkMatchSupplier, plainlySupplier, readLinkSkips, writeLinkSkips } from "@/lib/supplierLinks";
import { DocumentIcon } from "@/components/icons";
import Tip from "@/components/Tip";
import { loadFailed, saveFailed } from "@/lib/errorText";
import { todayISO } from "@/lib/today";

type ReceiptDraft = {
  clientId: string;
  vendor: string;
  date: string;
  category: string;
  totalAmount: string;
  vatAmount: string;
  currency: string;
  fxRateInput: string;
  notes: string;
  invoiceNumber: string;
  dueDate: string;
  paid: boolean;
};

// Credit notes are stored negative; the form holds positive figures and
// the sign is put back on save.
function draftForReceipt(r: Receipt): ReceiptDraft {
  const sign = r.documentType === "credit_note" ? -1 : 1;
  return {
    clientId: r.clientId,
    vendor: r.vendor,
    date: r.date,
    category: r.category,
    totalAmount: (sign * (r.amount + r.vatAmount)).toFixed(2),
    vatAmount: (sign * r.vatAmount).toFixed(2),
    currency: r.originalCurrency ?? "GBP",
    fxRateInput: r.fxRate != null ? String(r.fxRate) : "",
    notes: r.notes,
    invoiceNumber: r.invoiceNumber ?? "",
    dueDate: r.dueDate ?? "",
    paid: r.paid,
  };
}

// Same total-incl-VAT convention as everywhere else in the app -- what's
// typed is the total actually paid, converted to GBP at save time, never
// a raw net figure typed directly.
function draftGbpAmounts(draft: ReceiptDraft, documentType: DocumentType) {
  const total = parseFloat(draft.totalAmount) || 0;
  const vat = parseFloat(draft.vatAmount) || 0;
  const isCredit = documentType === "credit_note";
  const net = (totalGbp: number, vatGbp: number) => (isCredit ? -(totalGbp - vatGbp) : Math.max(0, totalGbp - vatGbp));
  if (draft.currency === "GBP") {
    return { netGbp: net(total, vat), vatGbp: isCredit ? -vat : vat, originalAmount: null, originalVatAmount: null, originalCurrency: null, fxRate: null };
  }
  const rate = parseFloat(draft.fxRateInput) || 0;
  const totalGbp = total * rate;
  const vatGbp = vat * rate;
  return {
    netGbp: net(totalGbp, vatGbp),
    vatGbp: isCredit ? -vatGbp : vatGbp,
    originalAmount: total,
    originalVatAmount: vat,
    originalCurrency: draft.currency,
    fxRate: rate,
  };
}

// Every card says what the document is: the page holds receipts and
// supplier invoices side by side, and a bill read as a receipt (or the
// other way round) has to be obvious at a glance.
const TYPE_LABEL: Record<DocumentType, { label: string; className: string }> = {
  receipt: { label: "Receipt", className: "bg-neutral-100 text-neutral-700" },
  invoice: { label: "Supplier invoice", className: "bg-blue-100 text-blue-800" },
  credit_note: { label: "Credit note", className: "bg-red-100 text-red-800" },
  other: { label: "Other document", className: "bg-neutral-100 text-neutral-700" },
};

type BillFilter = "" | "to_pay" | "overdue" | "due_week" | "paid";

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
}

function shortDate(iso: string, today: string): string {
  const withYear = iso.slice(0, 4) !== today.slice(0, 4);
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function billStatus(r: Receipt, today: string): { text: string; className: string } | null {
  if (r.documentType !== "invoice") return null;
  if (r.paid) return { text: "Paid", className: "bg-green-100 text-green-800" };
  if (!r.dueDate) return { text: "To pay", className: "bg-neutral-100 text-neutral-700" };
  const days = daysBetween(today, r.dueDate);
  if (days < 0) return { text: `Overdue · was due ${shortDate(r.dueDate, today)}`, className: "bg-red-100 text-red-800" };
  const when = days === 0 ? "today" : days === 1 ? "tomorrow" : shortDate(r.dueDate, today);
  return { text: `To pay · due ${when}`, className: days <= 3 ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-700" };
}

function matchesBillFilter(r: Receipt, filter: BillFilter, today: string): boolean {
  if (!filter) return true;
  if (r.documentType !== "invoice") return false;
  if (filter === "paid") return r.paid;
  if (r.paid) return false;
  if (filter === "to_pay") return true;
  if (!r.dueDate) return false;
  const days = daysBetween(today, r.dueDate);
  return filter === "overdue" ? days < 0 : days >= 0 && days <= 7;
}

export default function ReceiptsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [pageCounts, setPageCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>([...CATEGORIES]);
  const [error, setError] = useState<string | null>(null);

  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [filterStarredOnly, setFilterStarredOnly] = useState(false);
  const [filterTag, setFilterTag] = useState("");
  const [filterType, setFilterType] = useState<"" | DocumentType>("");
  const [filterBill, setFilterBill] = useState<BillFilter>("");

  const [openDetails, setOpenDetails] = useState<Set<string>>(new Set());
  const [linking, setLinking] = useState(false);
  // Documents not to offer again: dismissed, or unticked when linking.
  const [linkSkips, setLinkSkips] = useState<Set<string>>(new Set());
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [showLinkable, setShowLinkable] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ReceiptDraft | null>(null);
  const [editFxLoading, setEditFxLoading] = useState(false);
  const [editFxError, setEditFxError] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([clientsStore.all(), receiptsStore.all(), businessProfileStore.get(), receiptPagesStore.counts()])
      .then(([c, r, profile, counts]) => {
        setClients(c);
        setReceipts(r);
        setCategories(effectiveCategories(profile.customCategories, profile.accountKind));
        setPageCounts(counts);
        setLinkSkips(readLinkSkips());
      })
      .catch((err) => setError(loadFailed(err, "your receipts")))
      .finally(() => setLoading(false));
  }, []);

  // All suppliers, including archived ones -- used for filtering, where
  // an archived supplier's old receipts should still be findable.
  const suppliers = useMemo(() => clients.filter((c) => c.kind === "supplier"), [clients]);
  // Archived suppliers dropped from the edit form's picker (new
  // assignments shouldn't point at one), except the one already on the
  // receipt being edited, so its current value doesn't just vanish.
  const pickableSuppliers = useMemo(
    () => suppliers.filter((c) => !c.archived || c.id === editDraft?.clientId),
    [suppliers, editDraft?.clientId]
  );

  // Documents read before their supplier was added: matched by the name
  // on the document, and only to suppliers still in use. An empty supplier
  // set on purpose ("No supplier") is not offered back.
  const linkable = useMemo(() => {
    const active = suppliers.filter((c) => !c.archived);
    return receipts.flatMap((r) => {
      if (r.clientId || !r.vendor || r.details.noSupplier || linkSkips.has(r.id)) return [];
      const supplier = bulkMatchSupplier(r.vendor, active);
      return supplier ? [{ receipt: r, supplier }] : [];
    });
  }, [receipts, suppliers, linkSkips]);
  const toLink = linkable.filter(({ receipt }) => !unticked.has(receipt.id));
  const linkListOpen = linkable.length <= 3 || showLinkable;

  const today = todayISO();
  const receiptById = useMemo(() => new Map(receipts.map((r) => [r.id, r])), [receipts]);
  // Signed (negative) credit totals per invoice id, net and gross.
  const creditsByInvoice = useMemo(() => {
    const map = new Map<string, { net: number; gross: number }>();
    for (const r of receipts) {
      if (r.documentType !== "credit_note" || !r.creditOfReceiptId) continue;
      const entry = map.get(r.creditOfReceiptId) ?? { net: 0, gross: 0 };
      entry.net += r.amount;
      entry.gross += r.amount + r.vatAmount;
      map.set(r.creditOfReceiptId, entry);
    }
    return map;
  }, [receipts]);

  async function removeReceipt(r: Receipt) {
    const what = [r.vendor, money(r.amount + r.vatAmount)].filter(Boolean).join(", ");
    if (!window.confirm(`Remove ${what || "this receipt"}? It won't be in your records any more, and this can't be undone.`)) return;
    const id = r.id;
    setError(null);
    try {
      await receiptsStore.remove(id);
      setReceipts((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(saveFailed(err, "Could not remove receipt."));
    }
  }

  async function toggleStar(r: Receipt) {
    const next = !r.starred;
    setReceipts((prev) => prev.map((x) => (x.id === r.id ? { ...x, starred: next } : x)));
    try {
      await receiptsStore.update(r.id, { starred: next });
    } catch (err) {
      setReceipts((prev) => prev.map((x) => (x.id === r.id ? { ...x, starred: !next } : x)));
      setError(saveFailed(err, "Could not update receipt."));
    }
  }

  async function markPaid(r: Receipt) {
    setError(null);
    setReceipts((prev) => prev.map((x) => (x.id === r.id ? { ...x, paid: true } : x)));
    try {
      await receiptsStore.update(r.id, { paid: true });
    } catch (err) {
      setReceipts((prev) => prev.map((x) => (x.id === r.id ? { ...x, paid: false } : x)));
      setError(saveFailed(err, "Could not mark this invoice as paid."));
    }
  }

  function skipLinks(ids: string[]) {
    const next = new Set([...linkSkips, ...ids]);
    setLinkSkips(next);
    writeLinkSkips(next);
  }

  function toggleLinkTick(id: string) {
    setUnticked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async function linkSuppliers() {
    skipLinks(linkable.filter(({ receipt }) => unticked.has(receipt.id)).map(({ receipt }) => receipt.id));
    setError(null);
    setLinking(true);
    const results = await Promise.allSettled(
      toLink.map(({ receipt, supplier }) => receiptsStore.update(receipt.id, { clientId: supplier.id }).then(() => [receipt.id, supplier.id] as const))
    );
    const linked = new Map(results.flatMap((x) => (x.status === "fulfilled" ? [x.value] : [])));
    setReceipts((prev) => prev.map((r) => ({ ...r, clientId: linked.get(r.id) ?? r.clientId })));
    if (linked.size < toLink.length) setError(`Couldn't link ${toLink.length - linked.size} of them. Try again.`);
    setLinking(false);
  }

  function toggleDetails(id: string) {
    setOpenDetails((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function startEditReceipt(r: Receipt) {
    setEditingId(r.id);
    setEditDraft(draftForReceipt(r));
    setEditError(null);
    setEditFxError(null);
  }

  function cancelEditReceipt() {
    setEditingId(null);
    setEditDraft(null);
  }

  async function onEditCurrencyChange(next: string) {
    if (!editDraft) return;
    setEditDraft({ ...editDraft, currency: next, fxRateInput: next === "GBP" ? "" : editDraft.fxRateInput });
    setEditFxError(null);
    if (next === "GBP") return;
    // What this rate was asked for. A lookup takes seconds, and cancelling
    // and editing another receipt in the meantime used to land the old
    // answer on the new one -- converting a dollar receipt at a euro rate
    // and writing a figure several percent out onto a record that was
    // right before he touched it. The checks go inside the updater, which
    // sees the draft as it is now; `editingId` read out here would be the
    // value from the render this call started in, which is the same stale
    // reading that caused the problem.
    const forCurrency = next;
    const rateWhenAsked = editDraft.fxRateInput;
    setEditFxLoading(true);
    try {
      const rate = await getFxRate(next, "GBP");
      setEditDraft((prev) => {
        if (!prev || prev.currency !== forCurrency) return prev;
        // He typed one himself while this was in the air: his wins.
        if (prev.fxRateInput !== rateWhenAsked) return prev;
        return { ...prev, fxRateInput: String(rate) };
      });
    } catch (err) {
      setEditFxError(saveFailed(err, "Couldn't fetch an exchange rate -- enter one manually."));
    } finally {
      setEditFxLoading(false);
    }
  }

  async function saveEditReceipt(r: Receipt) {
    if (!editDraft) return;
    if (editDraft.currency !== "GBP" && !editDraft.fxRateInput) {
      setEditError("Enter an exchange rate before saving (or wait for it to load).");
      return;
    }
    setEditError(null);
    setEditBusy(true);
    try {
      const { netGbp, vatGbp, originalAmount, originalVatAmount, originalCurrency, fxRate } = draftGbpAmounts(editDraft, r.documentType);
      const isInvoice = r.documentType === "invoice";
      // Clearing a supplier is a choice the link offer must respect; picking
      // one again takes the flag off (undefined drops the key from the JSON).
      const unlinked = !!r.clientId && !editDraft.clientId;
      const relinked = !!editDraft.clientId && !!r.details.noSupplier;
      const patch = {
        clientId: editDraft.clientId,
        vendor: editDraft.vendor,
        date: editDraft.date,
        category: editDraft.category,
        amount: netGbp,
        vatAmount: vatGbp,
        originalAmount,
        originalVatAmount,
        originalCurrency,
        fxRate,
        notes: editDraft.notes,
        ...(isInvoice || r.documentType === "credit_note" ? { invoiceNumber: editDraft.invoiceNumber || null } : {}),
        ...(isInvoice ? { dueDate: editDraft.dueDate || null, paid: editDraft.paid } : {}),
        ...(unlinked || relinked ? { details: { ...r.details, noSupplier: unlinked ? (true as const) : undefined } } : {}),
      };
      await receiptsStore.update(r.id, patch);
      setReceipts((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
      setEditingId(null);
      setEditDraft(null);
    } catch (err) {
      setEditError(saveFailed(err, "Could not save changes."));
    } finally {
      setEditBusy(false);
    }
  }

  function clientName(id: string) {
    return clients.find((c) => c.id === id)?.name || "No supplier";
  }

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const r of receipts) for (const t of r.tags) set.add(t);
    return Array.from(set).sort();
  }, [receipts]);

  const filteredReceipts = useMemo(() => {
    const list = receipts.filter((r) => {
      if (filterFrom && r.date < filterFrom) return false;
      if (filterTo && r.date > filterTo) return false;
      if (filterCategory && r.category !== filterCategory) return false;
      if (filterClientId && r.clientId !== filterClientId) return false;
      if (filterStarredOnly && !r.starred) return false;
      if (filterTag && !r.tags.includes(filterTag)) return false;
      if (filterType && r.documentType !== filterType) return false;
      return matchesBillFilter(r, filterBill, today);
    });
    // Bills still to pay read best soonest-due first; no due date goes last.
    if (filterBill && filterBill !== "paid") list.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
    return list;
  }, [receipts, filterFrom, filterTo, filterCategory, filterClientId, filterStarredOnly, filterTag, filterType, filterBill, today]);

  function exportReceipts() {
    downloadCsv(
      `receipts-${todayISO()}.csv`,
      filteredReceipts.map((r) => ({
        date: r.date,
        type: r.documentType,
        invoice_number: r.invoiceNumber ?? "",
        due_date: r.dueDate ?? "",
        paid: r.paid ? "yes" : "no",
        vendor: r.vendor,
        supplier: clientName(r.clientId),
        category: r.category,
        amount_excl_vat: r.amount.toFixed(2),
        vat: r.vatAmount.toFixed(2),
        amount_incl_vat: (r.amount + r.vatAmount).toFixed(2),
        notes: r.notes,
        tags: r.tags.join("; "),
      }))
    );
  }

  function creditNoteFor(r: Receipt): string | null {
    const linked = r.creditOfReceiptId ? receiptById.get(r.creditOfReceiptId) : null;
    if (!linked) return null;
    if (linked.invoiceNumber) return `Credit note for ${linked.invoiceNumber}`;
    return `Credit note for a receipt from ${linked.vendor || clientName(linked.clientId)} on ${linked.date}`;
  }

  function detailLines(r: Receipt): { label: string; value: string }[] {
    const lines = (Object.keys(DOCUMENT_DETAIL_LABELS) as (keyof typeof DOCUMENT_DETAIL_LABELS)[])
      .filter((k) => r.details[k])
      .map((k) => ({ label: DOCUMENT_DETAIL_LABELS[k], value: r.details[k] as string }));
    return [...lines, ...(r.details.other ?? [])];
  }

  const hasActiveFilters = filterFrom || filterTo || filterCategory || filterClientId || filterStarredOnly || filterTag || filterType || filterBill;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Receipts &amp; bills</h1>
          <p className="mt-1 text-neutral-600">
            Receipts, supplier invoices (bills) and credit notes you&apos;ve captured.
          </p>
        </div>
        <div className="flex items-start gap-2">
          {receipts.length > 0 && (
            <button onClick={exportReceipts} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700">
              Download for a spreadsheet
            </button>
          )}
          <ScanOrAdd scanHref="/scan" scanLabel="Scan receipts" addHref="/receipts/new" />
        </div>
      </div>

      <Tip id="receipts-batch">
        Tip: <strong>Scan receipts</strong> keeps the camera open, so you can photograph a whole pile in one go, then
        check them and save them one after another.
      </Tip>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {linkable.length > 0 && (
        <div className="rounded-xl border bg-neutral-50 p-4 text-sm text-neutral-800">
          <div className="flex items-start justify-between gap-3">
            <span>
              {linkable.length} {linkable.length === 1 ? "document matches" : "documents match"} your suppliers
              {linkable.length > 3 && (
                <>
                  {" · "}
                  <button onClick={() => setShowLinkable((v) => !v)} aria-expanded={showLinkable} className="text-neutral-600 underline">
                    {showLinkable ? "hide" : "which?"}
                  </button>
                </>
              )}
            </span>
            <button onClick={() => skipLinks(linkable.map(({ receipt }) => receipt.id))} className="text-neutral-500" aria-label="Dismiss">✕</button>
          </div>
          {linkListOpen && (
            <ul className="mt-2">
              {linkable.map(({ receipt, supplier }) => (
                <li key={receipt.id}>
                  <label className="flex items-start gap-2 py-1 text-xs text-neutral-600">
                    <input
                      type="checkbox"
                      className="mt-px h-4 w-4 flex-shrink-0 accent-neutral-900"
                      checked={!unticked.has(receipt.id)}
                      onChange={() => toggleLinkTick(receipt.id)}
                    />
                    <span className="min-w-0 wrap-anywhere">
                      {receipt.vendor}
                      {receipt.invoiceNumber && ` · ${receipt.invoiceNumber}`} → <span className="font-medium text-neutral-800">{supplier.name}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={linkSuppliers}
            disabled={linking || toLink.length === 0}
            className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {linking ? "Linking…" : `Link ${toLink.length}`}
          </button>
        </div>
      )}

      <details className="rounded-xl border bg-white p-4 text-neutral-900 shadow-sm" open={!!hasActiveFilters}>
        <summary className="cursor-pointer text-sm font-medium">Filter</summary>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <select aria-label="Payment status" className="rounded-lg border px-3 py-2 text-sm" value={filterBill} onChange={(e) => setFilterBill(e.target.value as BillFilter)}>
            <option value="">All statuses</option>
            <option value="to_pay">To pay</option>
            <option value="overdue">Overdue</option>
            <option value="due_week">Due in the next 7 days</option>
            <option value="paid">Paid</option>
          </select>
          <select aria-label="Document type" className="rounded-lg border px-3 py-2 text-sm" value={filterType} onChange={(e) => setFilterType(e.target.value as "" | DocumentType)}>
            <option value="">All types</option>
            <option value="receipt">Receipts</option>
            <option value="invoice">Supplier invoices</option>
            <option value="credit_note">Credit notes</option>
            {receipts.some((r) => r.documentType === "other") && <option value="other">Other documents</option>}
          </select>
          <input type="date" className="rounded-lg border px-3 py-2 text-sm" placeholder="From" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
          <input type="date" className="rounded-lg border px-3 py-2 text-sm" placeholder="To" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
          <select className="rounded-lg border px-3 py-2 text-sm" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm" value={filterClientId} onChange={(e) => setFilterClientId(e.target.value)}>
            <option value="">All suppliers</option>
            {suppliers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={filterStarredOnly} onChange={(e) => setFilterStarredOnly(e.target.checked)} />
            Starred only
          </label>
          {allTags.length > 0 && (
            <select className="rounded-lg border px-3 py-2 text-sm" value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
              <option value="">All tags</option>
              {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>
        {hasActiveFilters && (
          <button
            onClick={() => { setFilterFrom(""); setFilterTo(""); setFilterCategory(""); setFilterClientId(""); setFilterStarredOnly(false); setFilterTag(""); setFilterType(""); setFilterBill(""); }}
            className="mt-2 text-sm text-blue-600"
          >
            Clear filters
          </button>
        )}
      </details>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-2">
          {filteredReceipts.length === 0 && !error && (
            <p className="text-sm text-neutral-500">
              {hasActiveFilters ? (
                "Nothing matches these filters."
              ) : (
                "No receipts or bills yet. Scan a few at once, or add one by hand."
              )}
            </p>
          )}
          {filteredReceipts.map((r) => {
            const isInvoice = r.documentType === "invoice";
            const isCredit = r.documentType === "credit_note";
            const type = TYPE_LABEL[r.documentType];
            const status = billStatus(r, today);
            const credits = isInvoice ? creditsByInvoice.get(r.id) : undefined;
            const extraPages = pageCounts.get(r.id) ?? 0;
            const details = detailLines(r);
            const supplierName = clients.find((c) => c.id === r.clientId)?.name;
            const detailsOpen = openDetails.has(r.id);
            return editingId === r.id && editDraft ? (
              <div key={r.id} className="space-y-3 rounded-xl border bg-white p-4 text-neutral-900 shadow-sm">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${type.className}`}>{type.label}</span>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={editDraft.clientId}
                  onChange={(e) => setEditDraft({ ...editDraft, clientId: e.target.value })}
                >
                  <option value="">No supplier / general expense</option>
                  {pickableSuppliers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {(isInvoice || isCredit) && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-neutral-500">{isInvoice ? "Invoice number" : "Credit note number"}</label>
                      <input
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        value={editDraft.invoiceNumber}
                        onChange={(e) => setEditDraft({ ...editDraft, invoiceNumber: e.target.value })}
                      />
                    </div>
                    {isInvoice && (
                      <div>
                        <label className="text-xs text-neutral-500">Due date</label>
                        <input
                          type="date"
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          value={editDraft.dueDate}
                          onChange={(e) => setEditDraft({ ...editDraft, dueDate: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" className="rounded-lg border px-3 py-2 text-sm" value={editDraft.date} onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })} />
                  <select className="rounded-lg border px-3 py-2 text-sm" value={editDraft.category} onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })}>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="Shop or supplier"
                  value={editDraft.vendor}
                  onChange={(e) => setEditDraft({ ...editDraft, vendor: e.target.value })}
                />
                <div className="grid grid-cols-3 gap-3">
                  <input
                    className="col-span-2 rounded-lg border px-3 py-2 text-sm"
                    placeholder={`${isCredit ? "Credited" : "Total"} (${editDraft.currency}, incl. VAT)`}
                    value={editDraft.totalAmount}
                    onChange={(e) => setEditDraft({ ...editDraft, totalAmount: e.target.value })}
                    inputMode="decimal"
                  />
                  <select className="rounded-lg border px-3 py-2 text-sm" value={editDraft.currency} onChange={(e) => onEditCurrencyChange(e.target.value)}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder={`Of which VAT (${editDraft.currency})`}
                  value={editDraft.vatAmount}
                  onChange={(e) => setEditDraft({ ...editDraft, vatAmount: e.target.value })}
                  inputMode="decimal"
                />
                {editDraft.currency !== "GBP" && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-neutral-500 whitespace-nowrap">1 {editDraft.currency} =</label>
                    <input
                      className="w-28 rounded-lg border px-2 py-1.5 text-sm"
                      value={editDraft.fxRateInput}
                      onChange={(e) => setEditDraft({ ...editDraft, fxRateInput: e.target.value })}
                      inputMode="decimal"
                      placeholder={editFxLoading ? "Loading…" : "rate"}
                    />
                    <span className="text-xs text-neutral-500">GBP {editFxLoading && "(fetching today's rate…)"}</span>
                  </div>
                )}
                {editFxError && <p className="text-xs text-amber-700">{editFxError}</p>}
                <p role="status" className="sr-only">{editFxError ?? ""}</p>
                {isInvoice && (
                  <label className="flex items-center gap-2 text-sm text-neutral-700">
                    <input type="checkbox" checked={editDraft.paid} onChange={(e) => setEditDraft({ ...editDraft, paid: e.target.checked })} />
                    Paid
                  </label>
                )}
                <textarea
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="Notes"
                  value={editDraft.notes}
                  onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })}
                />
                {editError && <p role="alert" className="text-sm text-red-600">{editError}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={() => saveEditReceipt(r)}
                    disabled={editBusy}
                    className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {editBusy ? "Saving…" : "Save"}
                  </button>
                  <button onClick={cancelEditReceipt} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
            <div key={r.id} className="rounded-xl border bg-white p-3 text-neutral-900 shadow-sm">
              <div className="flex gap-3">
                {r.imageDataUrl && (
                  isPdfDataUrl(r.imageDataUrl) ? (
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-neutral-100 text-neutral-500"><DocumentIcon className="h-6 w-6" /></div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imageDataUrl} alt="" className="h-12 w-12 flex-shrink-0 rounded object-cover" />
                  )
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">
                      {supplierName || r.vendor || r.category || "No supplier"}
                      {supplierName && r.vendor && !plainlySupplier(r.vendor, supplierName) && (
                        <span className="font-normal text-neutral-500"> · {r.vendor}</span>
                      )}
                    </span>
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      {credits && (
                        <span title="Has a credit note" className="rounded-sm bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800">CN</span>
                      )}
                      <span className="font-semibold">{money(r.amount + r.vatAmount + (credits?.gross ?? 0))}</span>
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${type.className}`}>{type.label}</span>
                    {status && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>{status.text}</span>}
                    {r.needsReview && (
                      <a href="/receipts/review" className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 no-underline">
                        Needs review
                      </a>
                    )}
                  </div>
                  <div className="mt-1 truncate text-xs text-neutral-500">
                    {[r.invoiceNumber, longDate(r.date), r.category].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                <button onClick={() => toggleDetails(r.id)} aria-expanded={detailsOpen} className="font-medium text-neutral-600">
                  Details {detailsOpen ? "▴" : "▾"}
                </button>
                <div className="flex items-center gap-3">
                  {isInvoice && !r.paid && !r.needsReview && (
                    <button onClick={() => markPaid(r)} className="font-medium text-blue-600">Mark as paid</button>
                  )}
                  <button
                    onClick={() => toggleStar(r)}
                    aria-label={r.starred ? "Unstar" : "Star"}
                    className={`text-lg leading-none ${r.starred ? "text-amber-500" : "text-neutral-300"}`}
                  >
                    ★
                  </button>
                  <button onClick={() => startEditReceipt(r)} className="font-medium text-blue-600">Edit</button>
                  <button onClick={() => removeReceipt(r)} className="text-red-600">Remove</button>
                </div>
              </div>
              {detailsOpen && (
                <div className="mt-2 space-y-1 border-t pt-2 text-sm text-neutral-600">
                  <div>
                    {credits ? (
                      <>
                        {money(r.amount + credits.net)} excl. VAT · {money(r.amount + r.vatAmount + credits.gross)} incl. VAT · {money(-credits.gross)} credited
                      </>
                    ) : (
                      <>{money(r.amount)} excl. VAT · {money(r.vatAmount)} VAT</>
                    )}
                    {r.originalCurrency && r.originalAmount != null && (
                      <span className="text-neutral-400">
                        {" "}(from {r.originalCurrency} {r.originalAmount.toFixed(2)} @ {r.fxRate?.toFixed(4)})
                      </span>
                    )}
                  </div>
                  {!supplierName ? (
                    <div className="text-neutral-500">No supplier linked</div>
                  ) : (
                    r.vendor && r.vendor !== supplierName && <div><span className="text-neutral-500">On the document:</span> {r.vendor}</div>
                  )}
                  {isCredit && creditNoteFor(r) && <div>{creditNoteFor(r)}</div>}
                  {extraPages > 0 && <div>{extraPages + 1} pages</div>}
                  {r.notes && <div className="italic">{r.notes}</div>}
                  {details.map((d, i) => (
                    <div key={i} className="wrap-anywhere"><span className="text-neutral-500">{d.label}:</span> {d.value}</div>
                  ))}
                  {r.warrantyMonths != null && (
                    <div className="text-xs text-neutral-400">
                      Warranty: {r.warrantyMonths} months (until {addMonths(r.date, r.warrantyMonths)})
                    </div>
                  )}
                  {r.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {r.tags.map((t) => (
                        <span key={t} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{t}</span>
                      ))}
                    </div>
                  )}
                  {r.lineItems.length > 0 && (
                    <ul className="space-y-0.5 text-xs text-neutral-500">
                      {r.lineItems.map((li, i) => (
                        <li key={i}>
                          {li.description} — {money((isCredit ? -1 : 1) * li.quantity * li.unitPrice)}
                          {li.category ? ` (${li.category})` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function addMonths(dateStr: string, months: number): string {
  // UTC methods throughout -- mixing a UTC-parsed date with local
  // setMonth/getMonth before an toISOString round-trip shifts the result
  // by a day whenever the viewer's timezone offset isn't zero.
  const d = new Date(dateStr);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
