"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Client, ReceiptLineItem, businessProfileStore, clientsStore, receiptsStore } from "@/lib/storage";
import { CATEGORIES, Category, effectiveCategories, mostUsedCategory } from "@/lib/categories";
import { getCurrentPosition, guessLocationContext } from "@/lib/geocode";
import { CURRENCIES, getFxRate } from "@/lib/fx";
import DocumentCapture, { CapturedFile } from "@/components/DocumentCapture";
import { DocumentIcon, PinIcon } from "@/components/icons";
import { takeScanCapture } from "@/lib/scanHandoff";

type Confidence = "high" | "low";

type ScanApiResult = {
  documentType: string;
  vendor: string | null;
  vendorConfidence: Confidence;
  date: string | null;
  dateConfidence: Confidence;
  totalAmount: number | null;
  totalAmountConfidence: Confidence;
  currency: string | null;
  vatAmount: number | null;
  vatAmountConfidence: Confidence;
  category: Category | null;
  lineItems: ReceiptLineItem[];
  contactPerson: string | null;
  contactEmail: string | null;
  notes: string | null;
};

// business_card is a different save path entirely (create a supplier, no
// amount involved). bank_statement/contract/barcode aren't a single
// financial transaction, so amount there is optional rather than
// required -- everything else keeps the normal receipt-style form.
function modeFor(documentType: string | null): "contact" | "archival" | "transactional" {
  if (documentType === "business_card") return "contact";
  if (documentType === "bank_statement" || documentType === "contract" || documentType === "barcode") return "archival";
  return "transactional";
}

function FieldFlag({ confidence }: { confidence: Confidence | null }) {
  if (confidence !== "low") return null;
  return (
    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      double-check this
    </span>
  );
}

export default function ScanPage() {
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [categories, setCategories] = useState<string[]>([...CATEGORIES]);

  // Starts true so the camera opens the instant this page mounts -- no
  // button to tap first. Only set false once something's been captured
  // (including a handoff capture from the dashboard's iOS Scan button,
  // read on mount below -- in that case this page never actually shows
  // the capture screen at all).
  const [showCapture, setShowCapture] = useState(true);
  const [capturedFile, setCapturedFile] = useState<CapturedFile | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<string | null>(null);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  // Total paid, VAT included -- what's actually printed as the receipt's
  // final total. Net is derived from total - VAT at save time, never
  // stored or edited directly, same fix as the manual Receipts form.
  const [totalAmount, setTotalAmount] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [fxRateInput, setFxRateInput] = useState("");
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<ReceiptLineItem[]>([]);
  const [contactPerson, setContactPerson] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [modeOverride, setModeOverride] = useState<"transactional" | null>(null);
  const [supplierSaved, setSupplierSaved] = useState(false);
  const [supplierDuplicate, setSupplierDuplicate] = useState(false);

  const [vendorConf, setVendorConf] = useState<Confidence | null>(null);
  const [dateConf, setDateConf] = useState<Confidence | null>(null);
  const [totalAmountConf, setTotalAmountConf] = useState<Confidence | null>(null);
  const [vatConf, setVatConf] = useState<Confidence | null>(null);

  const [locating, setLocating] = useState(false);
  const [locateNote, setLocateNote] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    // A handoff capture (the dashboard's iOS Scan button) can be read
    // synchronously -- do that first, before anything async, so the
    // capture screen never has a chance to render for it at all. Only
    // the actual extraction request has to wait for categories to load.
    const handoff = takeScanCapture();
    if (handoff) beginScan(handoff);

    Promise.all([clientsStore.all(), receiptsStore.all(), businessProfileStore.get()]).then(([c, r, profile]) => {
      setClients(c);
      const usual = mostUsedCategory(r.map((receipt) => receipt.category));
      if (usual) setCategory((prev) => prev || usual);
      const activeCategories = effectiveCategories(profile.customCategories);
      setCategories(activeCategories);

      // categories is passed explicitly rather than letting
      // runExtraction close over the categories state -- this callback
      // has just set it, but that update isn't visible in THIS closure
      // until the next render, so reading the state var here would still
      // see the stale default.
      if (handoff) runExtraction(handoff, activeCategories);
    });
    // Deliberately empty -- this only ever needs to run once, on mount.
    // beginScan/runExtraction aren't stable across renders (plain
    // function declarations, not memoized), so exhaustive-deps wants
    // them listed, but doing so would just make this effect's identity
    // churn on every render for no benefit -- nothing here should ever
    // re-fire once mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suppliers = clients.filter((c) => c.kind === "supplier" && !c.archived);

  function beginScan(file: CapturedFile) {
    setCapturedFile(file);
    setShowCapture(false);
    setScanning(true);
    setScanError(null);
    setModeOverride(null);
    setSupplierSaved(false);
    setSupplierDuplicate(false);
  }

  async function runExtraction(file: CapturedFile, categoriesForRequest: string[]) {
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: file.dataUrl, categories: categoriesForRequest }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Scan failed.");
      const result = body.result as ScanApiResult;

      setDocumentType(result.documentType);
      if (result.date) setDate(result.date);
      if (result.vendor) setVendor(result.vendor);
      if (result.category) setCategory(result.category);
      if (result.totalAmount !== null) setTotalAmount(String(result.totalAmount));
      if (result.vatAmount !== null) setVatAmount(String(result.vatAmount));
      if (result.notes) setNotes(result.notes);
      if (result.lineItems?.length) setLineItems(result.lineItems);
      setContactPerson(result.contactPerson || "");
      setContactEmail(result.contactEmail || "");
      setVendorConf(result.vendorConfidence);
      setDateConf(result.dateConfidence);
      setTotalAmountConf(result.totalAmountConfidence);
      setVatConf(result.vatAmountConfidence);
      if (result.currency && result.currency !== "GBP") {
        onCurrencyChange(result.currency);
      } else {
        setCurrency("GBP");
        setFxRateInput("");
        setFxError(null);
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  }

  // The normal path, when DocumentCapture's own capture screen was
  // actually shown -- by now the page has been mounted long enough that
  // categories has almost certainly already loaded, so reading it from
  // state here (rather than needing it passed in, like runExtraction
  // does for the handoff path above) is safe.
  async function onDocumentCaptured(file: CapturedFile) {
    beginScan(file);
    await runExtraction(file, categories);
  }

  function updateLineItem(idx: number, patch: Partial<ReceiptLineItem>) {
    setLineItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeLineItem(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function useLocation() {
    setLocating(true);
    setLocateNote(null);
    try {
      const pos = await getCurrentPosition();
      const guess = await guessLocationContext(pos.coords.latitude, pos.coords.longitude);
      const filled: string[] = [];
      if (guess.vendorName && !vendor) {
        setVendor(guess.vendorName);
        filled.push("shop name");
      }
      if (guess.category && !category) {
        setCategory(guess.category);
        filled.push("category");
      }
      setLocateNote(filled.length ? `Filled in ${filled.join(" and ")} from your location.` : "Couldn't recognize a business at your location.");
    } catch (err) {
      setLocateNote(err instanceof Error ? err.message : "Couldn't get your location.");
    } finally {
      setLocating(false);
    }
  }

  function clientName(id: string) {
    return clients.find((c) => c.id === id)?.name || "";
  }

  const mode = modeOverride ?? modeFor(documentType);

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
      setFxError(err instanceof Error ? err.message : "Couldn't fetch an exchange rate -- enter one manually.");
    } finally {
      setFxLoading(false);
    }
  }

  // Same conversion pattern as the manual Receipts form: whatever's typed
  // stays in `currency` until save time, when it's converted to GBP --
  // never stored as a raw foreign number.
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

  async function saveAsSupplier() {
    if (!vendor.trim()) {
      setSaveError("Enter a company name before saving.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const existing = clients.find(
        (c) => c.kind === "supplier" && c.name.trim().toLowerCase() === vendor.trim().toLowerCase()
      );
      if (existing) {
        setSupplierDuplicate(true);
        return;
      }
      await clientsStore.add({
        name: vendor,
        isCompany: true,
        email: contactEmail,
        address: "",
        kind: "supplier",
        vatNumber: "",
        paymentTerms: "",
        defaultCurrency: "",
        contactPerson,
        remindersEnabled: true,
      });
      setSupplierSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (mode === "transactional" && !totalAmount) {
      setSaveError("Enter a total before saving.");
      return;
    }
    if (currency !== "GBP" && !fxRateInput) {
      setSaveError("Enter an exchange rate before saving (or wait for it to load).");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const { netGbp, vatGbp, originalAmount, originalVatAmount, originalCurrency, fxRate } = gbpAmounts();
      await receiptsStore.add({
        clientId,
        date,
        vendor,
        category: category || "Other",
        amount: netGbp,
        vatAmount: vatGbp,
        originalAmount,
        originalVatAmount,
        originalCurrency,
        fxRate,
        imageDataUrl: capturedFile?.dataUrl ?? null,
        notes,
        starred: false,
        needsReview: false,
        warrantyMonths: null,
        tags: [],
        lineItems,
      });
      router.push("/receipts");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  if (showCapture) {
    return <DocumentCapture onCapture={onDocumentCaptured} onClose={() => router.push("/")} />;
  }

  const isPdf = capturedFile?.mediaType === "application/pdf";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Scan</h1>
        <p className="mt-1 text-neutral-600">
          Claude reads the document and fills in the details below for you.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <div className="flex items-center gap-3">
          {isPdf ? (
            <div className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border bg-neutral-50 text-xs text-neutral-500">
              <DocumentIcon className="h-6 w-6" />
              PDF
            </div>
          ) : capturedFile ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={capturedFile.dataUrl} alt="Document preview" className="h-20 w-20 rounded-lg border object-cover" />
          ) : null}
          <button
            onClick={() => setShowCapture(true)}
            disabled={scanning}
            className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50"
          >
            {scanning ? "Reading document…" : "Scan a different document"}
          </button>
        </div>

        {scanError && <p className="text-sm text-red-600">{scanError}</p>}
        {documentType && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-500">Recognized as: <span className="font-medium text-neutral-700">{documentType.replace("_", " ")}</span></p>
            {mode !== "transactional" && !modeOverride && (
              <button type="button" onClick={() => setModeOverride("transactional")} className="text-xs font-medium text-blue-600">
                Not right? Log as a normal receipt instead
              </button>
            )}
          </div>
        )}

        {mode === "archival" && documentType === "barcode" && notes && (
          <p className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
            Barcode value: <span className="font-mono font-medium">{notes}</span>
          </p>
        )}

        {mode === "contact" ? (
          <>
            <div>
              <input
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Company name"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
              />
              <FieldFlag confidence={vendorConf} />
            </div>
            <input
              className="w-full rounded-lg border px-3 py-2"
              placeholder="Contact person (optional)"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
            />
            <input
              className="w-full rounded-lg border px-3 py-2"
              placeholder="Email (optional)"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
            <textarea className="w-full rounded-lg border px-3 py-2" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

            {supplierDuplicate && (
              <p className="text-sm text-amber-700">
                Already have a supplier named &quot;{vendor}&quot; — didn&apos;t create a duplicate.{" "}
                <a href="/clients" className="font-medium underline">View suppliers</a>
              </p>
            )}
            {supplierSaved && <p className="text-sm text-green-700">Saved as a new supplier.</p>}
            {saveError && <p className="text-sm text-red-600">{saveError}</p>}

            <button
              onClick={saveAsSupplier}
              disabled={saving || supplierSaved}
              className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : supplierSaved ? "Saved" : "Save as new supplier"}
            </button>
          </>
        ) : (
        <>
        <select
          className="w-full rounded-lg border px-3 py-2"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        >
          <option value="">No supplier / general expense</option>
          {suppliers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <div>
          <button
            type="button"
            onClick={useLocation}
            disabled={locating}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 disabled:opacity-50"
          >
            {locating ? "Locating…" : (<><PinIcon /> Guess from my location</>)}
          </button>
          {locateNote && <p className="mt-1 text-sm text-neutral-500">{locateNote}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <input type="date" className="w-full rounded-lg border px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} />
            <FieldFlag confidence={dateConf} />
          </div>
          <select className="rounded-lg border px-3 py-2" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            <option value="">Overall category…</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <input
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Vendor / shop name"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
          />
          <FieldFlag confidence={vendorConf} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <input
              className="w-full rounded-lg border px-3 py-2"
              placeholder={mode === "archival" ? `Total paid (${currency}, optional)` : `Total paid (${currency}, incl. VAT)`}
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              inputMode="decimal"
            />
            <FieldFlag confidence={totalAmountConf} />
          </div>
          <select className="rounded-lg border px-3 py-2" value={currency} onChange={(e) => onCurrencyChange(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <input className="w-full rounded-lg border px-3 py-2" placeholder={`Of which VAT (${currency}, optional)`} value={vatAmount} onChange={(e) => setVatAmount(e.target.value)} inputMode="decimal" />
          <FieldFlag confidence={vatConf} />
        </div>
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
        {mode === "archival" && (
          <p className="text-xs text-neutral-500">
            {documentType?.replace("_", " ")}s aren&apos;t usually a single expense — leave the total blank to just file this away.
          </p>
        )}
        {totalAmount && (
          <p className="text-xs text-neutral-500">
            → £{gbpAmounts().netGbp.toFixed(2)} excl. VAT{currency !== "GBP" ? `, £${gbpAmounts().vatGbp.toFixed(2)} VAT` : ""}, recorded automatically{currency !== "GBP" ? " in GBP" : ""}.
          </p>
        )}

        {lineItems.length > 0 && (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs font-medium text-neutral-500">
              Items — give each its own category to split this receipt across categories (e.g. Groceries + Household).
            </p>
            {lineItems.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 items-center gap-2 text-sm">
                <input
                  className="col-span-4 rounded-lg border px-2 py-1.5"
                  value={it.description}
                  onChange={(e) => updateLineItem(idx, { description: e.target.value })}
                />
                <input
                  className="col-span-2 rounded-lg border px-2 py-1.5"
                  placeholder="Qty"
                  value={it.quantity}
                  onChange={(e) => updateLineItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                />
                <input
                  className="col-span-2 rounded-lg border px-2 py-1.5"
                  placeholder="Price"
                  value={it.unitPrice}
                  onChange={(e) => updateLineItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
                />
                <select
                  className="col-span-3 rounded-lg border px-2 py-1.5"
                  value={it.category ?? ""}
                  onChange={(e) => updateLineItem(idx, { category: e.target.value || null })}
                >
                  <option value="">No category</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={() => removeLineItem(idx)} className="col-span-1 text-red-600">✕</button>
              </div>
            ))}
          </div>
        )}

        <textarea className="w-full rounded-lg border px-3 py-2" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

        {clientId && <p className="text-xs text-neutral-500">Will be filed under {clientName(clientId)}.</p>}
        {saveError && <p className="text-sm text-red-600">{saveError}</p>}

        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : mode === "archival" ? "Save to your files" : "Save as receipt"}
        </button>
        </>
        )}
      </div>
    </div>
  );
}
