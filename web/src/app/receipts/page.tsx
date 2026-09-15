"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Client, Receipt, businessProfileStore, clientsStore, receiptsStore } from "@/lib/storage";
import { CATEGORIES, effectiveCategories } from "@/lib/categories";
import { downloadCsv } from "@/lib/exportCsv";
import { isPdfDataUrl } from "@/lib/fileType";
import { CURRENCIES, getFxRate } from "@/lib/fx";
import { DocumentIcon } from "@/components/icons";

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
};

function draftForReceipt(r: Receipt): ReceiptDraft {
  return {
    clientId: r.clientId,
    vendor: r.vendor,
    date: r.date,
    category: r.category,
    totalAmount: (r.amount + r.vatAmount).toFixed(2),
    vatAmount: r.vatAmount.toFixed(2),
    currency: r.originalCurrency ?? "GBP",
    fxRateInput: r.fxRate != null ? String(r.fxRate) : "",
    notes: r.notes,
  };
}

// Same total-incl-VAT convention as everywhere else in the app -- what's
// typed is the total actually paid, converted to GBP at save time, never
// a raw net figure typed directly.
function draftGbpAmounts(draft: ReceiptDraft) {
  const total = parseFloat(draft.totalAmount) || 0;
  const vat = parseFloat(draft.vatAmount) || 0;
  if (draft.currency === "GBP") {
    return { netGbp: Math.max(0, total - vat), vatGbp: vat, originalAmount: null, originalVatAmount: null, originalCurrency: null, fxRate: null };
  }
  const rate = parseFloat(draft.fxRateInput) || 0;
  const totalGbp = total * rate;
  const vatGbp = vat * rate;
  return {
    netGbp: Math.max(0, totalGbp - vatGbp),
    vatGbp,
    originalAmount: total,
    originalVatAmount: vat,
    originalCurrency: draft.currency,
    fxRate: rate,
  };
}

export default function ReceiptsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>([...CATEGORIES]);
  const [error, setError] = useState<string | null>(null);

  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [filterStarredOnly, setFilterStarredOnly] = useState(false);
  const [filterTag, setFilterTag] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ReceiptDraft | null>(null);
  const [editFxLoading, setEditFxLoading] = useState(false);
  const [editFxError, setEditFxError] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([clientsStore.all(), receiptsStore.all(), businessProfileStore.get()]).then(([c, r, profile]) => {
      setClients(c);
      setReceipts(r);
      setCategories(effectiveCategories(profile.customCategories));
      setLoading(false);
    });
  }, []);

  const suppliers = useMemo(() => clients.filter((c) => c.kind === "supplier"), [clients]);

  async function removeReceipt(id: string) {
    setError(null);
    try {
      await receiptsStore.remove(id);
      setReceipts((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove receipt.");
    }
  }

  async function toggleStar(r: Receipt) {
    const next = !r.starred;
    setReceipts((prev) => prev.map((x) => (x.id === r.id ? { ...x, starred: next } : x)));
    try {
      await receiptsStore.update(r.id, { starred: next });
    } catch (err) {
      setReceipts((prev) => prev.map((x) => (x.id === r.id ? { ...x, starred: !next } : x)));
      setError(err instanceof Error ? err.message : "Could not update receipt.");
    }
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
    setEditFxLoading(true);
    try {
      const rate = await getFxRate(next, "GBP");
      setEditDraft((prev) => (prev ? { ...prev, fxRateInput: String(rate) } : prev));
    } catch (err) {
      setEditFxError(err instanceof Error ? err.message : "Couldn't fetch an exchange rate -- enter one manually.");
    } finally {
      setEditFxLoading(false);
    }
  }

  async function saveEditReceipt(id: string) {
    if (!editDraft) return;
    if (editDraft.currency !== "GBP" && !editDraft.fxRateInput) {
      setEditError("Enter an exchange rate before saving (or wait for it to load).");
      return;
    }
    setEditError(null);
    setEditBusy(true);
    try {
      const { netGbp, vatGbp, originalAmount, originalVatAmount, originalCurrency, fxRate } = draftGbpAmounts(editDraft);
      await receiptsStore.update(id, {
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
      });
      setReceipts((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
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
              }
            : r
        )
      );
      setEditingId(null);
      setEditDraft(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Could not save changes.");
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
    return receipts.filter((r) => {
      if (filterFrom && r.date < filterFrom) return false;
      if (filterTo && r.date > filterTo) return false;
      if (filterCategory && r.category !== filterCategory) return false;
      if (filterClientId && r.clientId !== filterClientId) return false;
      if (filterStarredOnly && !r.starred) return false;
      if (filterTag && !r.tags.includes(filterTag)) return false;
      return true;
    });
  }, [receipts, filterFrom, filterTo, filterCategory, filterClientId, filterStarredOnly, filterTag]);

  function exportReceipts() {
    downloadCsv(
      `receipts-${new Date().toISOString().slice(0, 10)}.csv`,
      filteredReceipts.map((r) => ({
        date: r.date,
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

  const hasActiveFilters = filterFrom || filterTo || filterCategory || filterClientId || filterStarredOnly || filterTag;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Receipts</h1>
          <p className="mt-1 text-neutral-600">
            Scan or upload a receipt, tag it with a supplier and category, and it is saved for later.
          </p>
        </div>
        <div className="flex gap-2">
          {receipts.length > 0 && (
            <button onClick={exportReceipts} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700">
              Export CSV
            </button>
          )}
          <Link href="/receipts/new" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
            + New receipt
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <details className="rounded-xl border bg-white p-4 text-neutral-900 shadow-sm" open={!!hasActiveFilters}>
        <summary className="cursor-pointer text-sm font-medium">Filter</summary>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
            onClick={() => { setFilterFrom(""); setFilterTo(""); setFilterCategory(""); setFilterClientId(""); setFilterStarredOnly(false); setFilterTag(""); }}
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
          {filteredReceipts.length === 0 && (
            <p className="text-sm text-neutral-500">
              {hasActiveFilters ? (
                "No receipts match these filters."
              ) : (
                <>No receipts yet. <Link href="/receipts/new" className="text-blue-600 underline">Add one</Link>, or <Link href="/scan" className="text-blue-600 underline">scan one</Link> instead.</>
              )}
            </p>
          )}
          {filteredReceipts.map((r) =>
            editingId === r.id && editDraft ? (
              <div key={r.id} className="space-y-3 rounded-xl border bg-white p-4 text-neutral-900 shadow-sm">
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={editDraft.clientId}
                  onChange={(e) => setEditDraft({ ...editDraft, clientId: e.target.value })}
                >
                  <option value="">No supplier / general expense</option>
                  {suppliers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" className="rounded-lg border px-3 py-2 text-sm" value={editDraft.date} onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })} />
                  <select className="rounded-lg border px-3 py-2 text-sm" value={editDraft.category} onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })}>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="Vendor / shop name"
                  value={editDraft.vendor}
                  onChange={(e) => setEditDraft({ ...editDraft, vendor: e.target.value })}
                />
                <div className="grid grid-cols-3 gap-3">
                  <input
                    className="col-span-2 rounded-lg border px-3 py-2 text-sm"
                    placeholder={`Total (${editDraft.currency}, incl. VAT)`}
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
                <textarea
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="Notes"
                  value={editDraft.notes}
                  onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })}
                />
                {editError && <p className="text-sm text-red-600">{editError}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={() => saveEditReceipt(r.id)}
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
            <div key={r.id} className="flex items-center justify-between rounded-xl border bg-white p-4 text-neutral-900 shadow-sm">
              <div className="flex items-center gap-3">
                {r.imageDataUrl && (
                  isPdfDataUrl(r.imageDataUrl) ? (
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-neutral-100 text-neutral-500"><DocumentIcon className="h-6 w-6" /></div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imageDataUrl} alt="" className="h-12 w-12 rounded object-cover" />
                  )
                )}
                <div>
                  <div className="font-medium">
                    {r.vendor || r.category}
                    {r.needsReview && (
                      <a href="/receipts/review" className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 no-underline">
                        Needs review
                      </a>
                    )}
                  </div>
                  <div className="text-sm text-neutral-600">
                    £{r.amount.toFixed(2)} excl. VAT · £{(r.amount + r.vatAmount).toFixed(2)} incl. VAT
                    {r.originalCurrency && r.originalAmount != null && (
                      <span className="text-neutral-400">
                        {" "}(from {r.originalCurrency} {r.originalAmount.toFixed(2)} @ {r.fxRate?.toFixed(4)})
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-neutral-500">{r.date} · {r.category} · {clientName(r.clientId)}</div>
                  {r.notes && <div className="mt-1 text-sm text-neutral-500 italic">{r.notes}</div>}
                  {r.warrantyMonths != null && (
                    <div className="mt-1 text-xs text-neutral-400">
                      Warranty: {r.warrantyMonths} months (until {addMonths(r.date, r.warrantyMonths)})
                    </div>
                  )}
                  {r.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.tags.map((t) => (
                        <span key={t} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{t}</span>
                      ))}
                    </div>
                  )}
                  {r.lineItems.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-neutral-500">
                      {r.lineItems.map((li, i) => (
                        <li key={i}>
                          {li.description} — £{(li.quantity * li.unitPrice).toFixed(2)}
                          {li.category ? ` (${li.category})` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleStar(r)}
                  aria-label={r.starred ? "Unstar" : "Star"}
                  className={`text-lg ${r.starred ? "text-amber-500" : "text-neutral-300"}`}
                >
                  ★
                </button>
                <button onClick={() => startEditReceipt(r)} className="text-sm font-medium text-blue-600">Edit</button>
                <button onClick={() => removeReceipt(r.id)} className="text-sm text-red-600">Remove</button>
              </div>
            </div>
            )
          )}
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
