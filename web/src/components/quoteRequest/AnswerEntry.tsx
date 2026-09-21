"use client";

import { useRef, useState } from "react";
import PriceForm, { PriceDraft, draftFrom, readDraft } from "@/components/quoteRequest/PriceForm";
import { extractPages } from "@/lib/scanClient";
import { downscaleImageDataUrl } from "@/lib/imageDownscale";
import { ScannedLine, formatPounds, isDeliveryLine, matchScannedLines, scannedUnitPrice } from "@/lib/quoteCompare";
import { QuoteRequest, RequestSupplier, quoteDocumentUrl, requestSuppliersStore, uploadQuoteDocument } from "@/lib/quoteRequests";
import { errorText } from "@/lib/errorText";

const SECONDARY = "rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50";

const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Couldn't open that file."));
    r.readAsDataURL(file);
  });

const priceText = (n: number | null) => (n === null ? "" : String(Number(n.toFixed(4))));

// The owner puts in a supplier's prices: typed from a phone call or email,
// or read off the supplier's own PDF or photo, every line's match shown and
// changeable before anything is saved. Saved over the answer the page
// showed only; whatever it replaces is kept on the row.
export default function AnswerEntry({ request, row, supplierName, onCancel, onSaved }: {
  request: QuoteRequest;
  row: RequestSupplier;
  supplierName: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const items = request.items;
  const [draft, setDraft] = useState<PriceDraft>(() => draftFrom(items, row.status === "replied" ? row : undefined));
  const [file, setFile] = useState<{ dataUrl: string; mediaType: string; name: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [scanned, setScanned] = useState<ScannedLine[] | null>(null);
  const [matches, setMatches] = useState<Record<string, number | null>>({});
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    if (!/^image\/|^application\/pdf$/.test(f.type)) return setError("Attach a PDF or a photo of their quote.");
    try {
      const raw = await readFile(f);
      const dataUrl = f.type.startsWith("image/") ? await downscaleImageDataUrl(raw, 2000, 0.85) : raw;
      setFile({ dataUrl, mediaType: dataUrl.slice(5, dataUrl.indexOf(";")), name: f.name });
      setScanned(null);
      setNote(null);
    } catch (err) {
      setError(errorText(err, "Couldn't open that file."));
    }
  }

  async function read() {
    if (!file) return;
    setReading(true);
    setError(null);
    try {
      // A supplier's quote is one document; if their file holds more, the
      // first is theirs to price against this request.
      const [result] = await extractPages([{ dataUrl: file.dataUrl, mediaType: file.mediaType }], []);
      const lines = (result?.lineItems ?? []).filter((l) => l.description.trim());
      const priced = lines.filter((l) => !isDeliveryLine(l.description));
      const found = matchScannedLines(items, priced);
      const next: PriceDraft = { ...draft, lines: { ...draft.lines } };
      const byItem: Record<string, number | null> = {};
      items.forEach((item, i) => {
        const at = found[i] === null ? null : lines.indexOf(priced[found[i]!]);
        byItem[item.id] = at;
        if (at !== null) next.lines[item.id] = { ...next.lines[item.id], text: priceText(scannedUnitPrice(lines[at])), unavailable: false };
      });
      const delivery = lines.find((l) => isDeliveryLine(l.description));
      if (delivery && !draft.delivery.trim()) next.delivery = priceText(delivery.lineTotal ?? scannedUnitPrice(delivery));
      setScanned(lines);
      setMatches(byItem);
      setDraft(next);
      const n = Object.values(byItem).filter((v) => v !== null).length;
      setNote(
        lines.length
          ? `Read ${lines.length} ${lines.length === 1 ? "line" : "lines"} and matched ${n} of ${items.length}. Check each match and price below before saving.`
          : "No priced lines could be read from it. Type the prices in below; the document is still kept with them."
      );
    } catch (err) {
      setError(errorText(err, "Couldn't read their quote."));
    } finally {
      setReading(false);
    }
  }

  function rematch(itemId: string, at: number | null) {
    setMatches((m) => ({ ...m, [itemId]: at }));
    const line = at === null ? null : scanned![at];
    setDraft((d) => ({ ...d, lines: { ...d.lines, [itemId]: { ...d.lines[itemId], text: line ? priceText(scannedUnitPrice(line)) : "", unavailable: false } } }));
  }

  async function save() {
    setError(null);
    const r = readDraft(items, draft, false);
    if (!r.ok) return setError(r.error);
    if (!Object.values(r.prices).some((p) => p.price !== null)) return setError("Nothing is priced. If they can't quote, go back and mark them \"Can't quote\".");
    setSaving(true);
    try {
      const path = file ? await uploadQuoteDocument(row.id, file.dataUrl) : row.documentPath;
      await requestSuppliersStore.record(
        row,
        { status: "replied", prices: r.prices, delivery: r.delivery, vatIncluded: draft.vatIncluded, validUntil: draft.validUntil || null, note: draft.note.trim() },
        scanned ? "scan" : "manual",
        path
      );
      onSaved();
    } catch (err) {
      setError(errorText(err, "Couldn't save their prices."));
      setSaving(false);
    }
  }

  async function openDocument() {
    const url = row.documentPath ? await quoteDocumentUrl(row.documentPath) : null;
    if (url) window.open(url, "_blank", "noopener");
    else setError("Their document couldn't be opened. Try again.");
  }

  return (
    <div className="space-y-6">
      <div>
        <button onClick={onCancel} className="text-sm text-neutral-500">← Back to the request</button>
        <h1 className="mt-1 text-2xl font-bold">Prices from {supplierName}</h1>
        <p className="mt-1 text-neutral-600">Type in what they quoted, or attach their quote and have its lines read.</p>
      </div>

      {row.source === "online" && (
        <p className="rounded-lg border border-neutral-300 bg-neutral-50 p-3 text-sm text-neutral-700">
          {supplierName} sent these prices online. Saving replaces them with yours; theirs are kept with the request.
        </p>
      )}

      <section className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <h2 className="font-semibold">Their quote</h2>
        <p className="mt-1 text-sm text-neutral-600">A PDF or photo of the quote they sent you. It&apos;s kept with their prices.</p>
        {row.documentPath && !file && (
          <button type="button" onClick={openDocument} className="mt-2 text-sm font-medium text-neutral-900 underline">Open the one attached</button>
        )}
        <input ref={inputRef} type="file" accept="application/pdf,image/*" className="hidden" aria-label="Their quote document" onChange={(e) => pick(e.target.files?.[0])} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={reading || saving} className={SECONDARY}>
            {file ? "Choose another" : row.documentPath ? "Attach a new one" : "Attach their quote"}
          </button>
          {file && (
            <button type="button" onClick={read} disabled={reading || saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {reading ? "Reading…" : scanned ? "Read it again" : "Read its lines"}
            </button>
          )}
        </div>
        {file && <p className="mt-2 truncate text-xs text-neutral-500">{file.name}</p>}
        {note && <p className="mt-2 text-sm text-neutral-700" role="status">{note}</p>}
      </section>

      <section className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <h2 className="mb-3 font-semibold">Prices</h2>
        <PriceForm
          items={items}
          draft={draft}
          onChange={setDraft}
          disabled={saving}
          lineExtra={
            scanned
              ? (item) => (
                  <div>
                    <label className="text-xs text-neutral-500" htmlFor={`match-${item.id}`}>From their quote</label>
                    <select
                      id={`match-${item.id}`}
                      className="w-full rounded-lg border px-2 py-2 text-sm"
                      value={matches[item.id] ?? ""}
                      onChange={(e) => rematch(item.id, e.target.value === "" ? null : Number(e.target.value))}
                    >
                      <option value="">Not on their quote</option>
                      {scanned.map((l, at) => {
                        const unit = scannedUnitPrice(l);
                        return (
                          <option key={at} value={at}>
                            {l.description}
                            {unit !== null ? ` · ${formatPounds(unit)}` : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )
              : undefined
          }
        />
      </section>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={save} disabled={saving || reading} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save their prices"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className={SECONDARY}>Cancel</button>
      </div>
    </div>
  );
}
