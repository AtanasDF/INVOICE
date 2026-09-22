"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { readSheet, sheetCsv, sheetHtml, sheetText } from "@/lib/sheetFile";
import { saveBlob, saveText, sheetImage, tidyFileName } from "@/lib/saveFile";

export type SaveKind = "pdf" | "png" | "jpeg" | "word" | "html" | "text" | "csv";
type Kind = SaveKind;

// Plain names first, the file's ending after it, so nobody has to know
// what a PDF is to pick one.
export const SAVE_FORMATS: { kind: Kind; label: string; ending: string; note: string }[] = [
  { kind: "pdf", label: "PDF", ending: ".pdf", note: "Best for sending and printing" },
  { kind: "png", label: "Picture", ending: ".png", note: "For a message or a chat" },
  { kind: "jpeg", label: "Smaller picture", ending: ".jpg", note: "Smaller to send" },
  { kind: "word", label: "Word", ending: ".doc", note: "To edit in Word or Pages" },
  { kind: "html", label: "Web page", ending: ".html", note: "Opens in any browser" },
  { kind: "text", label: "Plain text", ending: ".txt", note: "Plain words, no layout" },
  { kind: "csv", label: "Spreadsheet", ending: ".csv", note: "The lines in Excel or Numbers" },
];

export const SAVE_FAILED = "That file couldn't be made. Try another kind, or the PDF.";

/** One document, one format, saved to the device. */
export async function saveSheetAs(kind: Kind, el: HTMLElement, name: string, onPdf?: () => Promise<void> | void) {
  const file = tidyFileName(name, "document");
  if (kind === "pdf") {
    if (onPdf) return void (await onPdf());
    const { renderInvoicePdf } = await import("@/lib/invoicePdf");
    return void (await renderInvoicePdf(el)).save(`${file}.pdf`);
  }
  if (kind === "png" || kind === "jpeg") {
    return saveBlob(`${file}${kind === "png" ? ".png" : ".jpg"}`, await sheetImage(el, kind === "png" ? "image/png" : "image/jpeg"));
  }
  const doc = readSheet(el);
  if (kind === "word") return saveText(`${file}.doc`, sheetHtml(doc), "application/msword");
  if (kind === "html") return saveText(`${file}.html`, sheetHtml(doc), "text/html");
  if (kind === "text") return saveText(`${file}.txt`, sheetText(doc), "text/plain");
  return saveText(`${file}.csv`, sheetCsv(doc), "text/csv");
}

// Every way to keep a document, beside the PDF that was the only one
// (Atanas, 2026-09-22: "the more options the better even in the free
// version"). The words and the lines come from the printed sheet itself.
export default function SaveAsMenu({
  sheet,
  name,
  onPdf,
  onOpenChange,
  label = "Save as",
  className = "rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700",
}: {
  sheet: () => HTMLElement | null;
  name: string;
  onPdf?: () => Promise<void> | void;
  // Told when the list opens, so a page that keeps its printed sheet out of
  // the way can put it up only while it is needed.
  onOpenChange?: (open: boolean) => void;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();

  // Held in a ref so opening and closing is the same function every
  // render, and the key and tap-away listeners are set up once.
  const told = useRef(onOpenChange);
  useEffect(() => {
    told.current = onOpenChange;
  });
  const show = useCallback((next: boolean) => {
    setOpen(next);
    told.current?.(next);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      show(false);
      button.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) show(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, show]);

  async function save(kind: Kind) {
    setError(null);
    setBusy(kind);
    try {
      const el = sheet();
      if (!el) throw new Error("nothing to save");
      await saveSheetAs(kind, el, name, onPdf);
      show(false);
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={box} className="relative inline-block print:hidden">
      <button ref={button} type="button" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => show(!open)} className={className}>
        {busy ? "Saving…" : label}
      </button>
      {open && (
        <div id={listId} className="absolute right-0 z-30 mt-2 w-64 max-h-[70vh] overflow-y-auto rounded-xl border bg-white py-1 text-left text-neutral-900 shadow-lg">
          {SAVE_FORMATS.map((f) => (
            <button
              key={f.kind}
              type="button"
              disabled={!!busy}
              onClick={() => void save(f.kind)}
              className="flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-neutral-50 disabled:opacity-50"
            >
              <span className="text-sm font-medium">
                {f.label} <span className="font-normal text-neutral-500">{f.ending}</span>
              </span>
              <span className="text-xs text-neutral-500">{f.note}</span>
            </button>
          ))}
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
