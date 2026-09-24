"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Client, Receipt, ReceiptPage, clientsStore, receiptPagesStore, receiptsStore } from "@/lib/storage";
import { isPdfDataUrl } from "@/lib/fileType";
import { money } from "@/lib/money";
import { DocumentIcon } from "@/components/icons";
import { loadFailed } from "@/lib/errorText";
import { shortDate } from "@/lib/dates";
import Tip from "@/components/Tip";
import EmailFileForm from "@/components/EmailFileForm";
import SaveThese from "@/components/SaveThese";

export default function FilesPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [pageCounts, setPageCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterSupplierId, setFilterSupplierId] = useState("");
  const [preview, setPreview] = useState<Receipt | null>(null);
  const [previewPages, setPreviewPages] = useState<{ receiptId: string; pages: ReceiptPage[] } | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const previewIdRef = useRef<string | null>(null);
  // The tile that opened the preview gets focus back when it closes, so
  // closing doesn't lose your place in the list; while it's open, Escape
  // closes it and the close button is where focus starts.
  const openerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    Promise.all([receiptsStore.all(), clientsStore.all(), receiptPagesStore.counts()])
      .then(([r, c, counts]) => {
        setReceipts(r);
        setClients(c);
        setPageCounts(counts);
      })
      .catch((err) => setError(loadFailed(err, "your documents")))
      .finally(() => setLoading(false));
  }, []);

  function openPreview(r: Receipt) {
    openerRef.current = document.activeElement as HTMLElement | null;
    previewIdRef.current = r.id;
    setPreview(r);
    setPreviewIndex(0);
    setPreviewPages(null);
    if (!pageCounts.get(r.id)) return;
    receiptPagesStore
      .forReceipt(r.id)
      .then((pages) => {
        if (previewIdRef.current === r.id) setPreviewPages({ receiptId: r.id, pages });
      })
      // Page 1 is already on screen; without this the extra pages spin forever.
      .catch(() => {
        if (previewIdRef.current === r.id) setPreviewPages({ receiptId: r.id, pages: [] });
      });
  }

  function closePreview() {
    previewIdRef.current = null;
    setPreview(null);
  }

  useEffect(() => {
    if (!preview) {
      // After the re-render, not in closePreview: until then the tile is
      // under inert and refuses focus.
      openerRef.current?.focus();
      openerRef.current = null;
      return;
    }
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePreview();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  const [makingFile, setMakingFile] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // The document as one file: page one and whatever pages came with it.
  async function makeFile() {
    if (!preview) return null;
    setFileError(null);
    setMakingFile(true);
    try {
      const sources = [preview.imageDataUrl, ...loadedPages.map((p) => p.imageDataUrl)].filter((s): s is string => !!s);
      // A page is a data URL or a signed link, and its kind is whatever it
      // says it is: a PNG embedded as a JPEG makes no file at all.
      const pages = await Promise.all(
        sources.map(async (src) => {
          const dataUrl = src.startsWith("data:")
            ? src
            : await fetch(src)
                .then((r) => r.blob())
                .then((b) => new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result));
                  reader.onerror = () => reject(new Error("unreadable"));
                  reader.readAsDataURL(b);
                }));
          return { dataUrl, mediaType: dataUrl.slice(5, dataUrl.indexOf(";")) || "image/jpeg" };
        })
      );
      const { pagesToPdf, pdfName } = await import("@/lib/documentPdf");
      const name = pdfName("", `${preview.vendor || preview.category || "Document"} ${shortDate(preview.date)}`);
      const bytes = await pagesToPdf(pages, name.replace(/\.pdf$/, ""));
      return { blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), name };
    } catch {
      setFileError("That file couldn't be made. Try again.");
      return null;
    } finally {
      setMakingFile(false);
    }
  }

  async function saveFile() {
    const made = await makeFile();
    if (!made) return;
    const { saveBlob } = await import("@/lib/saveFile");
    saveBlob(made.name, made.blob);
    setFileNote(`Saved as ${made.name}.`);
  }

  const suppliers = useMemo(() => clients.filter((c) => c.kind === "supplier"), [clients]);

  function supplierName(id: string) {
    return clients.find((c) => c.id === id)?.name || "No supplier";
  }

  const files = useMemo(() => {
    return receipts
      .filter((r) => r.imageDataUrl)
      .filter((r) => (filterFrom ? r.date >= filterFrom : true))
      .filter((r) => (filterTo ? r.date <= filterTo : true))
      .filter((r) => (filterSupplierId ? r.clientId === filterSupplierId : true));
  }, [receipts, filterFrom, filterTo, filterSupplierId]);

  const hasActiveFilters = filterFrom || filterTo || filterSupplierId;

  // A photograph we emailed away and cleared leaves no tile, which on its own
  // reads as "my receipts have gone". They have not: say so here, where the
  // gap is, rather than leaving someone to work it out.
  const emailed = useMemo(() => receipts.filter((r) => r.details?.photoAgedAt).length, [receipts]);

  const previewTotalPages = preview ? 1 + (pageCounts.get(preview.id) ?? 0) : 1;
  const loadedPages = preview && previewPages?.receiptId === preview.id ? previewPages.pages : [];
  const previewSrc = preview ? (previewIndex === 0 ? preview.imageDataUrl : loadedPages[previewIndex - 1]?.imageDataUrl ?? null) : null;

  return (
    <div className="space-y-6">
      {/* While the preview is up nothing behind it can take focus: it is a
          dialog with no focus trap, and Tab used to walk out of it into the
          filters and tiles it covered. */}
      <div inert={!!preview} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">File library</h1>
        <p className="mt-1 text-neutral-600">Every scanned or uploaded receipt document, in one place.</p>
      </div>
      <Tip id="files-how">How it works: every photo and file you have saved is here, newest first. Tap one to see it or save it to your device.</Tip>
      {emailed > 0 && (
        <p className="rounded-xl border bg-white p-4 text-sm text-neutral-600 shadow-sm">
          {emailed === 1 ? "One older photo has" : `${emailed} older photos have`} been emailed to you and cleared from here to keep the app free.
          {" "}Those receipts are all still in your records — the supplier, the date, the amount and the VAT are untouched.
        </p>
      )}

      {/* Acts on whatever the filter is showing, so "this year, from
          Jewson" is set up once and used for both looking and saving. */}
      {!loading && !error && files.length > 0 && (
        <SaveThese
          receipts={files}
          clients={clients}
          from={filterFrom}
          to={filterTo}
          supplier={filterSupplierId ? supplierName(filterSupplierId) : ""}
        />
      )}

      <details className="rounded-xl border bg-white p-4 text-neutral-900 shadow-sm" open={!!hasActiveFilters}>
        <summary className="cursor-pointer text-sm font-medium">Filter</summary>
        <div className="mt-3 grid grid-cols-2 items-end gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-0.5 text-xs text-neutral-500">From<input type="date" className="rounded-lg border px-3 py-2 text-sm text-neutral-900" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} /></label>
          <label className="flex flex-col gap-0.5 text-xs text-neutral-500">To<input type="date" className="rounded-lg border px-3 py-2 text-sm text-neutral-900" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} /></label>
          <select aria-label="Supplier" className="rounded-lg border px-3 py-2 text-sm" value={filterSupplierId} onChange={(e) => setFilterSupplierId(e.target.value)}>
            <option value="">All suppliers</option>
            {suppliers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {hasActiveFilters && (
          <button
            onClick={() => { setFilterFrom(""); setFilterTo(""); setFilterSupplierId(""); }}
            className="mt-2 text-sm text-neutral-700 underline"
          >
            Clear filters
          </button>
        )}
      </details>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-600">{error}</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {hasActiveFilters ? (
            "No files match these filters."
          ) : (
            <>No scanned or uploaded documents yet. <Link href="/scan" className="text-neutral-700 underline">Scan one</Link>.</>
          )}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {files.map((r) => {
            const extra = pageCounts.get(r.id) ?? 0;
            return (
              <button
                key={r.id}
                onClick={() => openPreview(r)}
                className="rounded-xl border bg-white p-2 text-left shadow-sm transition hover:shadow-md"
              >
                {isPdfDataUrl(r.imageDataUrl) ? (
                  <div className="flex aspect-square items-center justify-center rounded-lg bg-neutral-100 text-neutral-500"><DocumentIcon className="h-8 w-8" /></div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.imageDataUrl ?? undefined} alt="" className="aspect-square w-full rounded-lg object-cover" />
                )}
                <div className="mt-2 text-xs font-medium text-neutral-900 truncate">{r.vendor || r.category}</div>
                <div className="text-xs text-neutral-500">{shortDate(r.date)} · {money(r.amount)}</div>
                {extra > 0 && <div className="text-xs text-neutral-500">{extra + 1} pages</div>}
              </button>
            );
          })}
        </div>
      )}
      </div>

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${preview.vendor || preview.category || "Document"} preview`}
          className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4"
          style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
          onClick={closePreview}
        >
          <div className="flex items-center justify-between text-ink-on-dark">
            <div>
              <div className="font-medium">{preview.vendor || preview.category}</div>
              <div className="text-sm text-neutral-500">
                {shortDate(preview.date)} · {money(preview.amount)} · {supplierName(preview.clientId)}
              </div>
            </div>
            <button ref={closeRef} onClick={closePreview} aria-label="Close preview" className="text-2xl leading-none text-ink-on-dark/80">✕</button>
          </div>
          <div className="mt-4 flex flex-1 items-center justify-center overflow-auto" onClick={(e) => e.stopPropagation()}>
            {!previewSrc ? (
              <p className="text-sm text-neutral-500">Loading page…</p>
            ) : isPdfDataUrl(previewSrc) ? (
              <iframe src={previewSrc} className="h-full w-full rounded-lg bg-white" title="Document preview" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewSrc} alt={`${preview.vendor || preview.category || "Document"}, page ${previewIndex + 1}`} className="max-h-full max-w-full rounded-lg object-contain" />
            )}
          </div>
          {/* Every document here can leave: saved as one file, or emailed
              to anyone (Atanas, 2026-09-22). */}
          <div className="mt-4 max-h-[45vh] overflow-y-auto rounded-xl bg-white p-4 text-neutral-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={saveFile} disabled={makingFile} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {makingFile ? "Making the file…" : "Save it"}
              </button>
              <span className="text-sm text-neutral-600">{previewTotalPages === 1 ? "One page" : `${previewTotalPages} pages`}, as one file.</span>
            </div>
            {fileNote && <p className="mt-2 text-sm text-neutral-700">{fileNote}</p>}
            {fileError && <p role="alert" className="mt-2 text-sm text-red-600">{fileError}</p>}
            <EmailFileForm file={makeFile} idPrefix="library" />
          </div>
          {previewTotalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-4 text-sm text-ink-on-dark" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setPreviewIndex((i) => i - 1)}
                disabled={previewIndex === 0}
                className="rounded-lg border border-ink-on-dark/40 px-3 py-1.5 font-medium disabled:opacity-40"
              >
                Previous
              </button>
              <span>Page {previewIndex + 1} of {previewTotalPages}</span>
              <button
                onClick={() => setPreviewIndex((i) => i + 1)}
                disabled={previewIndex >= previewTotalPages - 1}
                className="rounded-lg border border-ink-on-dark/40 px-3 py-1.5 font-medium disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
