"use client";

import { useRef, useState } from "react";
import { Client, Receipt, receiptPagesStore } from "@/lib/storage";
import { buildExport, gather, periodLabel, type ExportShape } from "@/lib/fileExport";
import { saveBlob } from "@/lib/saveFile";
import { saveFailed } from "@/lib/errorText";

// Taking a period of paperwork off the app and onto a device. It is the
// answer to the photo-ageing job: nobody should be asked to let old pictures
// go without a way to keep their own copy of them first.
const SHAPES: { id: ExportShape; label: string; hint: string }[] = [
  { id: "zip", label: "A folder of files", hint: "Every photo and PDF, named by date and supplier" },
  { id: "pictures", label: "Pictures only", hint: "The photographs, without the PDFs" },
  { id: "pdf", label: "One PDF", hint: "All of it in a single document, in date order" },
  { id: "pdf-per-supplier", label: "One PDF per supplier", hint: "A folder with a document for each one you buy from" },
];

export default function SaveThese({ receipts, clients, from, to, supplier }: {
  receipts: Receipt[];
  clients: Client[];
  from: string;
  to: string;
  supplier: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportShape | null>(null);
  const [step, setStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // Reading hundreds of photographs takes real seconds, and `disabled` lands
  // a render too late to stop the second press starting it all again.
  const running = useRef(false);

  async function save(shape: ExportShape) {
    if (running.current) return;
    running.current = true;
    setError(null);
    setDone(null);
    setBusy(shape);
    try {
      const label = periodLabel(from, to, supplier);
      setStep(`Reading ${receipts.length} document${receipts.length === 1 ? "" : "s"}…`);
      const extraPages = await receiptPagesStore.all();
      const items = await gather(receipts, clients, extraPages, (n, total) => setStep(`Reading ${n} of ${total}…`));
      setStep("Putting it together…");
      const file = await buildExport(items, shape, label);
      saveBlob(file.name, file.blob);
      setDone(`${file.name} saved to your device.`);
      setOpen(false);
    } catch (err) {
      setError(saveFailed(err, "Couldn't save those. Try a shorter period."));
    } finally {
      running.current = false;
      setBusy(null);
      setStep("");
    }
  }

  return (
    <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold">Save these to your device</h2>
          <p className="mt-1 text-sm text-neutral-600">
            {receipts.length} document{receipts.length === 1 ? "" : "s"}{supplier ? ` from ${supplier}` : ""}
            {from || to ? `, ${periodLabel(from, to, "")}` : ""}. Nothing is uploaded — it is all made on this device.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setOpen((o) => !o); setError(null); }}
          aria-expanded={open}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
        >
          {open ? "Not now" : "Save them"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-1">
          {SHAPES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => save(s.id)}
              disabled={!!busy}
              className="flex w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left hover:bg-neutral-50 disabled:opacity-50"
            >
              <span className="text-sm font-medium">{busy === s.id ? step || "Working…" : s.label}</span>
              <span className="text-xs text-neutral-500">{s.hint}</span>
            </button>
          ))}
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      {done && <p role="status" className="mt-2 text-sm text-neutral-700">{done}</p>}
    </div>
  );
}
