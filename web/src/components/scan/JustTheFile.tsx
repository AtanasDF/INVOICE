"use client";

import { useRef, useState } from "react";
import EmailFileForm from "@/components/EmailFileForm";
import type { DocPage } from "@/lib/documentPdf";
import { saveBlob } from "@/lib/saveFile";

// A document that is nobody's supplier: keep the file, save nothing else.
//
// Atanas, 2026-09-26: "The system should allow you to scan documents from a
// company that isn't theirs and the system should be also able to process
// (send or download the file) without saving a new company to the account."
//
// The first half already worked -- the supplier box can be left on "No supplier
// / general expense" and nothing is created. This is the second half: a
// document photographed at the scanner that is not an expense at all, and has
// no business becoming a receipt. A delivery note to forward, somebody else's
// invoice, a certificate. Until now the only way out of the walk was Save,
// which writes a receipt, or Skip, which throws the photograph away.
//
// Nothing here touches the account: no receipt row, no contact, no upload. The
// PDF is made in the browser from the pages already in hand, exactly as /copy
// does it, and handed to the device.
export default function JustTheFile({ pages, suggestedName }: { pages: DocPage[]; suggestedName: string }) {
  const [open, setOpen] = useState(false);
  const [made, setMade] = useState<{ blob: Blob; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Making the PDF and handing it over is a once-at-a-time job, and `disabled`
  // is applied on the render after the press.
  const working = useRef(false);

  async function make() {
    if (made) return made;
    const { pagesToPdf, pdfName } = await import("@/lib/documentPdf");
    const filename = pdfName(suggestedName, suggestedName || "document");
    const bytes = await pagesToPdf(pages, filename.replace(/\.pdf$/, ""));
    const next = { blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), name: filename };
    setMade(next);
    return next;
  }

  async function run(what: "save" | "share") {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const m = await make();
      if (what === "save") {
        saveBlob(m.name, m.blob);
        setNote("Saved to your device. Nothing was added to your records.");
        return;
      }
      const file = new File([m.blob], m.name, { type: "application/pdf" });
      if (!navigator.canShare?.({ files: [file] })) {
        setError("This browser can't share files. Save it instead, then send it from your files.");
        return;
      }
      try {
        await navigator.share({ files: [file], title: m.name });
        setNote("Shared. Nothing was added to your records.");
      } catch {
        // Closing the share sheet is not a failure.
      }
    } catch {
      setError("Couldn't make the file from these pages. Try retaking the photo.");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 text-sm font-medium text-neutral-700 underline"
      >
        Not yours? Just keep the file
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
      <h3 className="font-medium">Just the file</h3>
      <p className="mt-1 text-sm text-neutral-600">
        For a document that isn&apos;t one of your own costs — somebody else&apos;s invoice, a delivery note, a
        certificate. It becomes a PDF on this device. <strong>Nothing is added to your records and no supplier is
        created.</strong>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => run("save")}
          disabled={busy}
          className="min-h-11 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Working…" : "Save the file"}
        </button>
        <button
          type="button"
          onClick={() => run("share")}
          disabled={busy}
          className="min-h-11 rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50"
        >
          Share it
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 text-sm font-medium text-neutral-700 underline">
          Back
        </button>
      </div>
      {error && <p role="alert" className="mt-2 wrap-anywhere text-sm text-red-600">{error}</p>}
      {note && <p role="status" className="mt-2 text-sm text-neutral-600">{note}</p>}
      <div className="mt-4 border-t pt-4">
        <EmailFileForm file={make} heading="Or email it to someone" idPrefix="scan-file" className="space-y-2" />
      </div>
    </div>
  );
}
