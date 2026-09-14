"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Client, Receipt, clientsStore, receiptsStore } from "@/lib/storage";
import { CATEGORIES, Category, mostUsedCategory } from "@/lib/categories";
import { downloadCsv } from "@/lib/exportCsv";
import { isPdfDataUrl } from "@/lib/fileType";

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

export default function ReceiptsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [warrantyMonths, setWarrantyMonths] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [possibleDuplicate, setPossibleDuplicate] = useState<Receipt | null>(null);
  const [confirmedDuplicate, setConfirmedDuplicate] = useState(false);

  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [filterStarredOnly, setFilterStarredOnly] = useState(false);
  const [filterTag, setFilterTag] = useState("");

  useEffect(() => {
    Promise.all([clientsStore.all(), receiptsStore.all()]).then(([c, r]) => {
      setClients(c);
      setReceipts(r);
      setLoading(false);
      const usual = mostUsedCategory(r.map((receipt) => receipt.category));
      if (usual) setCategory(usual);
    });
  }, []);

  const suppliers = useMemo(() => clients.filter((c) => c.kind === "supplier"), [clients]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  function findDuplicate(): Receipt | null {
    const amt = parseFloat(amount) || 0;
    return (
      receipts.find(
        (r) =>
          r.vendor.trim().toLowerCase() === vendor.trim().toLowerCase() &&
          vendor.trim() !== "" &&
          Math.abs(r.amount - amt) < 0.01 &&
          daysBetween(r.date, date) <= 3
      ) || null
    );
  }

  async function addReceipt(e: React.FormEvent) {
    e.preventDefault();
    if (!amount) return;

    if (!confirmedDuplicate) {
      const dup = findDuplicate();
      if (dup) {
        setPossibleDuplicate(dup);
        return;
      }
    }

    setError(null);
    setSaving(true);
    try {
      const created = await receiptsStore.add({
        clientId,
        date,
        vendor,
        category,
        amount: parseFloat(amount) || 0,
        vatAmount: parseFloat(vatAmount) || 0,
        imageDataUrl,
        notes,
        starred: false,
        warrantyMonths: warrantyMonths ? parseInt(warrantyMonths, 10) : null,
        tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
        lineItems: [],
      });
      setReceipts((prev) => [created, ...prev]);
      setVendor("");
      setAmount("");
      setVatAmount("");
      setNotes("");
      setWarrantyMonths("");
      setTagsInput("");
      setImageDataUrl(null);
      setPossibleDuplicate(null);
      setConfirmedDuplicate(false);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save receipt.");
    } finally {
      setSaving(false);
    }
  }

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
        {receipts.length > 0 && (
          <button onClick={exportReceipts} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700">
            Export CSV
          </button>
        )}
      </div>

      <form onSubmit={addReceipt} className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
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
          <option value="">No supplier / general expense</option>
          {suppliers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <input
            type="date"
            className="rounded-lg border px-3 py-2"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setConfirmedDuplicate(false);
              setPossibleDuplicate(null);
            }}
          />
          <select className="rounded-lg border px-3 py-2" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <input
          className="w-full rounded-lg border px-3 py-2"
          placeholder="Vendor / shop name"
          value={vendor}
          onChange={(e) => {
            setVendor(e.target.value);
            setConfirmedDuplicate(false);
            setPossibleDuplicate(null);
          }}
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            className="rounded-lg border px-3 py-2"
            placeholder="Amount (£)"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setConfirmedDuplicate(false);
              setPossibleDuplicate(null);
            }}
            inputMode="decimal"
          />
          <input className="rounded-lg border px-3 py-2" placeholder="VAT amount (£)" value={vatAmount} onChange={(e) => setVatAmount(e.target.value)} inputMode="decimal" />
        </div>
        <textarea className="w-full rounded-lg border px-3 py-2" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <input
          className="w-full rounded-lg border px-3 py-2"
          placeholder="Warranty length in months (optional, e.g. 24)"
          value={warrantyMonths}
          onChange={(e) => setWarrantyMonths(e.target.value)}
          inputMode="numeric"
        />
        <input
          className="w-full rounded-lg border px-3 py-2"
          placeholder="Tags, comma separated (optional, e.g. Site A, Q3 job)"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {possibleDuplicate && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            This looks like it might already be saved — {possibleDuplicate.vendor || possibleDuplicate.category}, £
            {possibleDuplicate.amount.toFixed(2)} on {possibleDuplicate.date}.
            <button
              type="button"
              onClick={() => {
                setConfirmedDuplicate(true);
                setPossibleDuplicate(null);
              }}
              className="ml-2 font-medium underline"
            >
              Save it anyway
            </button>
          </div>
        )}
        <button disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save receipt"}
        </button>
      </form>

      <details className="rounded-xl border bg-white p-4 text-neutral-900 shadow-sm" open={!!hasActiveFilters}>
        <summary className="cursor-pointer text-sm font-medium">Filter</summary>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input type="date" className="rounded-lg border px-3 py-2 text-sm" placeholder="From" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
          <input type="date" className="rounded-lg border px-3 py-2 text-sm" placeholder="To" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
          <select className="rounded-lg border px-3 py-2 text-sm" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
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
              {hasActiveFilters ? "No receipts match these filters." : "No receipts saved yet."}
            </p>
          )}
          {filteredReceipts.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border bg-white p-4 text-neutral-900 shadow-sm">
              <div className="flex items-center gap-3">
                {r.imageDataUrl && (
                  isPdfDataUrl(r.imageDataUrl) ? (
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-neutral-100 text-xl">📄</div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imageDataUrl} alt="" className="h-12 w-12 rounded object-cover" />
                  )
                )}
                <div>
                  <div className="font-medium">{r.vendor || r.category}</div>
                  <div className="text-sm text-neutral-600">
                    £{r.amount.toFixed(2)} excl. VAT · £{(r.amount + r.vatAmount).toFixed(2)} incl. VAT
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
                <button onClick={() => removeReceipt(r.id)} className="text-sm text-red-600">Remove</button>
              </div>
            </div>
          ))}
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
