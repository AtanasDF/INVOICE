"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Client, ReceiptLineItem, businessProfileStore, clientsStore, receiptsStore } from "@/lib/storage";
import { CATEGORIES, Category, effectiveCategories, mostUsedCategory } from "@/lib/categories";
import { getCurrentPosition, guessLocationContext } from "@/lib/geocode";
import DocumentCapture, { CapturedFile } from "@/components/DocumentCapture";

type Confidence = "high" | "low";

type ScanApiResult = {
  documentType: string;
  vendor: string | null;
  vendorConfidence: Confidence;
  date: string | null;
  dateConfidence: Confidence;
  totalAmount: number | null;
  totalAmountConfidence: Confidence;
  vatAmount: number | null;
  vatAmountConfidence: Confidence;
  category: Category | null;
  lineItems: ReceiptLineItem[];
  notes: string | null;
};

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
  // button to tap first. Only set false once something's been captured.
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
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<ReceiptLineItem[]>([]);

  const [vendorConf, setVendorConf] = useState<Confidence | null>(null);
  const [dateConf, setDateConf] = useState<Confidence | null>(null);
  const [totalAmountConf, setTotalAmountConf] = useState<Confidence | null>(null);
  const [vatConf, setVatConf] = useState<Confidence | null>(null);

  const [locating, setLocating] = useState(false);
  const [locateNote, setLocateNote] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    clientsStore.all().then(setClients);
    receiptsStore.all().then((r) => {
      const usual = mostUsedCategory(r.map((receipt) => receipt.category));
      if (usual) setCategory((prev) => prev || usual);
    });
    businessProfileStore.get().then((profile) => {
      setCategories(effectiveCategories(profile.customCategories));
    });
  }, []);

  const suppliers = clients.filter((c) => c.kind === "supplier");

  async function onDocumentCaptured(file: CapturedFile) {
    setCapturedFile(file);
    setShowCapture(false);
    setScanning(true);
    setScanError(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: file.dataUrl, categories }),
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
      setVendorConf(result.vendorConfidence);
      setDateConf(result.dateConfidence);
      setTotalAmountConf(result.totalAmountConfidence);
      setVatConf(result.vatAmountConfidence);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
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

  async function save() {
    if (!totalAmount) {
      setSaveError("Enter a total before saving.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const total = parseFloat(totalAmount) || 0;
      const vat = parseFloat(vatAmount) || 0;
      await receiptsStore.add({
        clientId,
        date,
        vendor,
        category: category || "Other",
        amount: Math.max(0, total - vat),
        vatAmount: vat,
        imageDataUrl: capturedFile?.dataUrl ?? null,
        notes,
        starred: false,
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
            <div className="flex h-20 w-20 flex-col items-center justify-center rounded-lg border bg-neutral-50 text-xs text-neutral-500">
              <span className="text-2xl">📄</span>
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
          <p className="text-sm text-neutral-500">Recognized as: <span className="font-medium text-neutral-700">{documentType.replace("_", " ")}</span></p>
        )}

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
            className="text-sm font-medium text-blue-600 disabled:opacity-50"
          >
            {locating ? "Locating…" : "📍 Guess from my location"}
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <input className="w-full rounded-lg border px-3 py-2" placeholder="Total paid (£, incl. VAT)" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} inputMode="decimal" />
            <FieldFlag confidence={totalAmountConf} />
          </div>
          <div>
            <input className="w-full rounded-lg border px-3 py-2" placeholder="Of which VAT (£, optional)" value={vatAmount} onChange={(e) => setVatAmount(e.target.value)} inputMode="decimal" />
            <FieldFlag confidence={vatConf} />
          </div>
        </div>
        {totalAmount && vatAmount && (
          <p className="text-xs text-neutral-500">
            → £{Math.max(0, (parseFloat(totalAmount) || 0) - (parseFloat(vatAmount) || 0)).toFixed(2)} excl. VAT, recorded automatically.
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
          {saving ? "Saving…" : "Save as receipt"}
        </button>
      </div>
    </div>
  );
}
