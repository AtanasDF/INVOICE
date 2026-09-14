"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Client, InvoiceItem, clientsStore, receiptsStore } from "@/lib/storage";
import { CATEGORIES, Category } from "@/lib/categories";
import { getCurrentPosition, guessLocationContext } from "@/lib/geocode";
import DocumentCapture, { CapturedFile } from "@/components/DocumentCapture";

type Confidence = "high" | "low";

type ScanApiResult = {
  documentType: string;
  vendor: string | null;
  vendorConfidence: Confidence;
  date: string | null;
  dateConfidence: Confidence;
  amount: number | null;
  amountConfidence: Confidence;
  vatAmount: number | null;
  vatAmountConfidence: Confidence;
  category: Category | null;
  lineItems: InvoiceItem[];
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
  const [amount, setAmount] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [notes, setNotes] = useState("");

  const [vendorConf, setVendorConf] = useState<Confidence | null>(null);
  const [dateConf, setDateConf] = useState<Confidence | null>(null);
  const [amountConf, setAmountConf] = useState<Confidence | null>(null);
  const [vatConf, setVatConf] = useState<Confidence | null>(null);

  const [locating, setLocating] = useState(false);
  const [locateNote, setLocateNote] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    clientsStore.all().then(setClients);
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
        body: JSON.stringify({ image: file.dataUrl }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Scan failed.");
      const result = body.result as ScanApiResult;

      setDocumentType(result.documentType);
      if (result.date) setDate(result.date);
      if (result.vendor) setVendor(result.vendor);
      if (result.category) setCategory(result.category);
      if (result.amount !== null) setAmount(String(result.amount));
      if (result.vatAmount !== null) setVatAmount(String(result.vatAmount));
      if (result.notes) setNotes(result.notes);
      setVendorConf(result.vendorConfidence);
      setDateConf(result.dateConfidence);
      setAmountConf(result.amountConfidence);
      setVatConf(result.vatAmountConfidence);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
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
    if (!amount) {
      setSaveError("Enter an amount before saving.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await receiptsStore.add({
        clientId,
        date,
        vendor,
        category: category || "Other",
        amount: parseFloat(amount) || 0,
        vatAmount: parseFloat(vatAmount) || 0,
        imageDataUrl: capturedFile?.dataUrl ?? null,
        notes,
        starred: false,
        warrantyMonths: null,
        tags: [],
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
            <option value="">Category…</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
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
            <input className="w-full rounded-lg border px-3 py-2" placeholder="Amount excl. VAT (£)" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            <FieldFlag confidence={amountConf} />
          </div>
          <div>
            <input className="w-full rounded-lg border px-3 py-2" placeholder="VAT amount (£)" value={vatAmount} onChange={(e) => setVatAmount(e.target.value)} inputMode="decimal" />
            <FieldFlag confidence={vatConf} />
          </div>
        </div>

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
