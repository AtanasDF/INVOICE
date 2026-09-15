"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Client, Receipt, clientsStore, receiptsStore } from "@/lib/storage";
import { isPdfDataUrl } from "@/lib/fileType";
import { DocumentIcon } from "@/components/icons";

export default function FilesPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterSupplierId, setFilterSupplierId] = useState("");
  const [preview, setPreview] = useState<Receipt | null>(null);

  useEffect(() => {
    Promise.all([receiptsStore.all(), clientsStore.all()]).then(([r, c]) => {
      setReceipts(r);
      setClients(c);
      setLoading(false);
    });
  }, []);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">File library</h1>
        <p className="mt-1 text-neutral-600">Every scanned or uploaded receipt document, in one place.</p>
      </div>

      <details className="rounded-xl border bg-white p-4 text-neutral-900 shadow-sm" open={!!hasActiveFilters}>
        <summary className="cursor-pointer text-sm font-medium">Filter</summary>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <input type="date" className="rounded-lg border px-3 py-2 text-sm" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
          <input type="date" className="rounded-lg border px-3 py-2 text-sm" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
          <select className="rounded-lg border px-3 py-2 text-sm" value={filterSupplierId} onChange={(e) => setFilterSupplierId(e.target.value)}>
            <option value="">All suppliers</option>
            {suppliers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {hasActiveFilters && (
          <button
            onClick={() => { setFilterFrom(""); setFilterTo(""); setFilterSupplierId(""); }}
            className="mt-2 text-sm text-blue-600"
          >
            Clear filters
          </button>
        )}
      </details>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {hasActiveFilters ? (
            "No files match these filters."
          ) : (
            <>No scanned or uploaded documents yet. <Link href="/scan" className="text-blue-600 underline">Scan one</Link>.</>
          )}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {files.map((r) => (
            <button
              key={r.id}
              onClick={() => setPreview(r)}
              className="rounded-xl border bg-white p-2 text-left shadow-sm transition hover:shadow-md"
            >
              {isPdfDataUrl(r.imageDataUrl) ? (
                <div className="flex aspect-square items-center justify-center rounded-lg bg-neutral-100 text-neutral-500"><DocumentIcon className="h-8 w-8" /></div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.imageDataUrl ?? undefined} alt="" className="aspect-square w-full rounded-lg object-cover" />
              )}
              <div className="mt-2 text-xs font-medium text-neutral-900 truncate">{r.vendor || r.category}</div>
              <div className="text-xs text-neutral-500">{r.date} · £{r.amount.toFixed(2)}</div>
            </button>
          ))}
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4"
          style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
          onClick={() => setPreview(null)}
        >
          <div className="flex items-center justify-between text-white">
            <div>
              <div className="font-medium">{preview.vendor || preview.category}</div>
              <div className="text-sm text-neutral-300">
                {preview.date} · £{preview.amount.toFixed(2)} · {supplierName(preview.clientId)}
              </div>
            </div>
            <button onClick={() => setPreview(null)} className="text-2xl leading-none text-white/80">✕</button>
          </div>
          <div className="mt-4 flex flex-1 items-center justify-center overflow-auto" onClick={(e) => e.stopPropagation()}>
            {isPdfDataUrl(preview.imageDataUrl) ? (
              <iframe src={preview.imageDataUrl ?? undefined} className="h-full w-full rounded-lg bg-white" title="Document preview" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.imageDataUrl ?? undefined} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
