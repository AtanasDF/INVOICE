"use client";

const MISSING_TOTAL = "Enter the total paid before saving.";

import { useEffect, useMemo, useRef, useState } from "react";
import { money } from "@/lib/money";
import { useRouter } from "next/navigation";
import { Client, Receipt, ReceiptLineItem, businessProfileStore, clientsStore, receiptsStore } from "@/lib/storage";
import { CATEGORIES, Category, effectiveCategories, mostUsedCategory, withCurrent } from "@/lib/categories";
import { CURRENCIES, getFxRate } from "@/lib/fx";
import { DocumentIcon } from "@/components/icons";
import { downscaleImageDataUrl } from "@/lib/imageDownscale";
import { findDuplicate } from "@/lib/duplicates";
import ClearFormButton from "@/components/ClearFormButton";
import ContactField, { type Usage } from "@/components/ContactField";
import { loadFailed, saveFailed } from "@/lib/errorText";
import { todayISO } from "@/lib/today";

export default function NewReceiptPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [categories, setCategories] = useState<string[]>([...CATEGORIES]);
  const [clientId, setClientId] = useState("");
  const [supplierText, setSupplierText] = useState("");
  const [date, setDate] = useState(() => todayISO());
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  // What the user actually types is the TOTAL paid (what's printed on the
  // receipt, VAT included) -- net is derived from total - VAT below, never
  // typed directly. The old plain "Amount (£)" field was ambiguous and
  // getting treated as net-of-VAT while people typed in the receipt's
  // printed total, silently overstating every expense by the VAT amount.
  const [totalAmount, setTotalAmount] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  // When currency is GBP (the default), totalAmount/vatAmount above are
  // the figures actually stored, same as always. Anything else is a
  // foreign-currency purchase: totalAmount/vatAmount are then in THAT
  // currency, fxRateInput converts 1 unit of it to GBP, and the GBP
  // equivalent (what everywhere else in the app reads) is computed at
  // save time -- never stored as a raw foreign number.
  const [currency, setCurrency] = useState("GBP");
  const [fxRateInput, setFxRateInput] = useState("");
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<ReceiptLineItem[]>([]);
  const [warrantyMonths, setWarrantyMonths] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [possibleDuplicate, setPossibleDuplicate] = useState<Receipt | null>(null);
  const [confirmedDuplicate, setConfirmedDuplicate] = useState(false);

  useEffect(() => {
    Promise.all([clientsStore.all(), receiptsStore.all(), businessProfileStore.get()])
      .then(([c, r, profile]) => {
        setClients(c);
        setReceipts(r);
        setCategories(effectiveCategories(profile.customCategories, profile.accountKind));
        const usual = mostUsedCategory(r.map((receipt) => receipt.category));
        if (usual) setCategory(usual);
      })
      // The form still works without them: only the supplier list and the
      // usual category are missing, so say so rather than block the page.
      .catch((err) => setError(loadFailed(err, "your suppliers and categories", "You can still fill this in.")));
  }, []);

  const suppliers = clients.filter((c) => c.kind === "supplier" && !c.archived);

  const supplierUsage = useMemo(() => {
    const out: Usage = {};
    for (const r of receipts) {
      if (!r.clientId) continue;
      const seen = out[r.clientId];
      out[r.clientId] = { count: (seen?.count ?? 0) + 1, last: seen && seen.last > r.date ? seen.last : r.date };
    }
    return out;
  }, [receipts]);

  function pickSupplier(c: Client | null) {
    setClientId(c?.id ?? "");
    if (c) {
      setSupplierText("");
      if (!vendor.trim()) setVendor(c.name);
    }
    setConfirmedDuplicate(false);
    setPossibleDuplicate(null);
  }

  function handleFile(file: File) {
    setError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        setImageDataUrl(await downscaleImageDataUrl(reader.result as string));
      } catch {
        // Not saveFailed: this is our own decode failing, not Supabase, and
        // its message ("Could not read this image.") says nothing about
        // what to do instead. A HEIC straight off an iPhone is the common
        // case, and Chrome can't decode one.
        setError("Could not read this photo. Try a JPEG or PNG.");
      }
    };
    reader.onerror = () => setError("Could not read this photo. Try a JPEG or PNG.");
    reader.readAsDataURL(file);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function onCurrencyChange(next: string) {
    setCurrency(next);
    setFxError(null);
    if (next === "GBP") {
      setFxRateInput("");
      return;
    }
    setFxLoading(true);
    try {
      const rate = await getFxRate(next, "GBP");
      setFxRateInput(String(rate));
    } catch (err) {
      setFxError(saveFailed(err, "Couldn't fetch an exchange rate -- enter one manually."));
    } finally {
      setFxLoading(false);
    }
  }

  // GBP-equivalent net/VAT for whatever's currently in the form, plus the
  // original-currency figures to store alongside for reference. This is
  // the one place the currency conversion actually happens -- both the
  // duplicate check and the save itself read from here, so they can never
  // disagree with each other.
  function gbpAmounts() {
    const total = parseFloat(totalAmount) || 0;
    const vat = parseFloat(vatAmount) || 0;
    if (currency === "GBP") {
      return { netGbp: Math.max(0, total - vat), vatGbp: vat, originalAmount: null, originalVatAmount: null, originalCurrency: null, fxRate: null };
    }
    const rate = parseFloat(fxRateInput) || 0;
    const totalGbp = total * rate;
    const vatGbp = vat * rate;
    return {
      netGbp: Math.max(0, totalGbp - vatGbp),
      vatGbp,
      originalAmount: total,
      originalVatAmount: vat,
      originalCurrency: currency,
      fxRate: rate,
    };
  }

  function addReceiptLine() {
    setLineItems((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0, category: null }]);
  }

  function updateReceiptLine(idx: number, patch: Partial<ReceiptLineItem>) {
    setLineItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeReceiptLine(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const filled = !!(clientId || supplierText || vendor || totalAmount || vatAmount || currency !== "GBP" || notes || lineItems.length || warrantyMonths || tagsInput || imageDataUrl);

  function clearForm() {
    setClientId("");
    setSupplierText("");
    setDate(todayISO());
    setVendor("");
    setCategory(mostUsedCategory(receipts.map((r) => r.category)) ?? CATEGORIES[0]);
    setTotalAmount("");
    setVatAmount("");
    setCurrency("GBP");
    setFxRateInput("");
    setFxError(null);
    setNotes("");
    setLineItems([]);
    setWarrantyMonths("");
    setTagsInput("");
    setImageDataUrl(null);
    if (fileRef.current) fileRef.current.value = "";
    setError(null);
    setPossibleDuplicate(null);
    setConfirmedDuplicate(false);
  }

  function duplicateOf(): Receipt | null {
    const { netGbp, vatGbp } = gbpAmounts();
    return findDuplicate({ clientId, vendor, invoiceNumber: null, date, gross: netGbp + vatGbp, isCreditNote: false }, receipts);
  }

  // Named so the box and the message can point at each other without the two
  // drifting apart.
  async function addReceipt(e: React.FormEvent) {
    e.preventDefault();
    if (!totalAmount) return setError(MISSING_TOTAL);
    if (currency !== "GBP" && !fxRateInput) {
      setError("Enter an exchange rate before saving (or wait for it to load).");
      return;
    }

    if (!confirmedDuplicate) {
      const dup = duplicateOf();
      if (dup) {
        setPossibleDuplicate(dup);
        return;
      }
    }

    setError(null);
    setSaving(true);
    try {
      const { netGbp, vatGbp, originalAmount, originalVatAmount, originalCurrency, fxRate } = gbpAmounts();
      await receiptsStore.add({
        clientId,
        date,
        vendor,
        category,
        amount: netGbp,
        vatAmount: vatGbp,
        originalAmount,
        originalVatAmount,
        originalCurrency,
        fxRate,
        imageDataUrl,
        notes,
        starred: false,
        needsReview: false,
        warrantyMonths: warrantyMonths ? parseInt(warrantyMonths, 10) : null,
        tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
        lineItems,
      });
      router.push("/receipts");
    } catch (err) {
      setError(saveFailed(err, "Could not save receipt."));
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New receipt</h1>
        <p className="mt-1 text-neutral-600">
          Scan or upload a receipt, tag it with a supplier and category, and it is saved for later.
        </p>
      </div>

      <form onSubmit={addReceipt} className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition ${
            dragOver ? "border-neutral-900 bg-neutral-50" : "border-neutral-300 hover:border-neutral-400"
          }`}
        >
          {imageDataUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageDataUrl} alt="Receipt preview" className="h-32 rounded-lg border object-cover" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setImageDataUrl(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="text-xs font-medium text-neutral-600 underline"
              >
                Remove photo
              </button>
            </>
          ) : (
            <>
              <DocumentIcon className="h-8 w-8 text-neutral-400" />
              <p className="text-sm text-neutral-600">Drop a photo here, or click to browse</p>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onFile}
            className="hidden"
          />
        </div>
        <ContactField
          kind="supplier"
          contacts={suppliers}
          selectedId={clientId}
          onSelect={pickSupplier}
          onCreated={(c) => setClients((prev) => [...prev, c])}
          usage={supplierUsage}
          text={supplierText}
          onText={setSupplierText}
          placeholder="Supplier — type a name, or tap the arrow"
          emptyOption="No supplier / general expense"
        />
        <div className="grid grid-cols-2 gap-3">
          <input aria-label="Date"
            type="date"
            className="rounded-lg border px-3 py-2"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setConfirmedDuplicate(false);
              setPossibleDuplicate(null);
            }}
          />
          <select aria-label="Category" className="rounded-lg border px-3 py-2" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {/* The usual category may have left the list when the kind of account changed; it stays choosable. */}
            {withCurrent(categories, category).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <input aria-label="Shop or supplier"
          className="w-full rounded-lg border px-3 py-2"
          placeholder="Shop or supplier"
          value={vendor}
          onChange={(e) => {
            setVendor(e.target.value);
            setConfirmedDuplicate(false);
            setPossibleDuplicate(null);
          }}
        />
        <div className="grid grid-cols-3 gap-3">
          <input aria-label="Total"
            id="receipt-total"
            aria-invalid={error === MISSING_TOTAL || undefined}
            aria-describedby={error === MISSING_TOTAL ? "receipt-error" : undefined}
            className="col-span-2 rounded-lg border px-3 py-2"
            placeholder={`Total paid (${currency}, incl. VAT)`}
            value={totalAmount}
            onChange={(e) => {
              setTotalAmount(e.target.value);
              setConfirmedDuplicate(false);
              setPossibleDuplicate(null);
            }}
            inputMode="decimal"
          />
          <select aria-label="Currency" className="rounded-lg border px-3 py-2" value={currency} onChange={(e) => onCurrencyChange(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <input aria-label="VAT" className="w-full rounded-lg border px-3 py-2" placeholder={`Of which VAT (${currency}, optional)`} value={vatAmount} onChange={(e) => { setVatAmount(e.target.value); setConfirmedDuplicate(false); setPossibleDuplicate(null); }} inputMode="decimal" />
        {currency !== "GBP" && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-500 whitespace-nowrap">1 {currency} =</label>
            <input
              className="w-28 rounded-lg border px-2 py-1.5 text-sm"
              value={fxRateInput}
              onChange={(e) => setFxRateInput(e.target.value)}
              inputMode="decimal"
              placeholder={fxLoading ? "Loading…" : "rate"}
            />
            <span className="text-xs text-neutral-500">GBP {fxLoading && "(fetching today's rate…)"}</span>
          </div>
        )}
        {fxError && <p className="text-xs text-amber-700">{fxError}</p>}
        <p role="status" className="sr-only">{fxError ?? ""}</p>
        {totalAmount && (
          <p className="text-xs text-neutral-500">
            → {money(gbpAmounts().netGbp)} excl. VAT{currency !== "GBP" ? `, ${money(gbpAmounts().vatGbp)} VAT` : ""}, recorded automatically{currency !== "GBP" ? " in GBP" : ""}.
          </p>
        )}

        {lineItems.length > 0 && (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs font-medium text-neutral-500">
              Items — give each its own category to split this receipt across categories (e.g. Groceries + Household).
            </p>
            {lineItems.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 items-center gap-2 text-sm">
                <input aria-label="Item"
                  className="col-span-4 rounded-lg border px-2 py-1.5"
                  placeholder="Item"
                  value={it.description}
                  onChange={(e) => updateReceiptLine(idx, { description: e.target.value })}
                />
                <input aria-label="Qty"
                  className="col-span-2 rounded-lg border px-2 py-1.5"
                  placeholder="Qty"
                  value={it.quantity}
                  onChange={(e) => updateReceiptLine(idx, { quantity: parseFloat(e.target.value) || 0 })}
                />
                <input aria-label="Price"
                  className="col-span-2 rounded-lg border px-2 py-1.5"
                  placeholder="Price"
                  value={it.unitPrice}
                  onChange={(e) => updateReceiptLine(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
                />
                <select
                  className="col-span-3 rounded-lg border px-2 py-1.5"
                  value={it.category ?? ""}
                  onChange={(e) => updateReceiptLine(idx, { category: e.target.value || null })}
                >
                  <option value="">No category</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button type="button" onClick={() => removeReceiptLine(idx)} aria-label={`Remove item ${idx + 1}`} className="col-span-1 text-neutral-600">✕</button>
              </div>
            ))}
          </div>
        )}
        <button type="button" onClick={addReceiptLine} className="text-sm font-medium text-neutral-700 underline">
          + Split into multiple items
        </button>

        <textarea aria-label="Notes" className="w-full rounded-lg border px-3 py-2" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <input aria-label="Warranty length in months"
          className="w-full rounded-lg border px-3 py-2"
          placeholder="Warranty length in months (optional, e.g. 24)"
          value={warrantyMonths}
          onChange={(e) => setWarrantyMonths(e.target.value)}
          inputMode="numeric"
        />
        <input aria-label="Tags"
          className="w-full rounded-lg border px-3 py-2"
          placeholder="Tags, comma separated (optional, e.g. Site A, Q3 job)"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
        />
        {error && <p id="receipt-error" role="alert" className="text-sm text-red-600">{error}</p>}
        {possibleDuplicate && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            This looks like it might already be saved — {possibleDuplicate.vendor || possibleDuplicate.category}, £
            {(possibleDuplicate.amount + possibleDuplicate.vatAmount).toFixed(2)} on {possibleDuplicate.date}.
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
        <div className="flex items-center justify-between gap-3">
          <button disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save receipt"}
          </button>
          <ClearFormButton onClear={clearForm} disabled={saving || !filled} />
        </div>
      </form>
    </div>
  );
}
