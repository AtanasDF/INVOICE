"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import CaptureButton from "@/components/CaptureButton";
import DocumentCapture, { CapturedFile } from "@/components/DocumentCapture";
import InvoiceDocument from "@/components/invoice/InvoiceDocument";
import DraftEditor from "@/components/free-invoice/DraftEditor";
import ScaledPreview from "@/components/free-invoice/ScaledPreview";
import { Segmented } from "@/components/free-invoice/fields";
import { DocumentIcon } from "@/components/icons";
import { useAuth } from "@/lib/authContext";
import type { ScanEngine } from "@/lib/extractors";
import type { InvoiceTemplate } from "@/lib/invoiceTemplate";
import { MAX_BATCH_CHARS } from "@/lib/scanClient";
import { supabase } from "@/lib/supabaseClient";
import {
  FreeInvoiceDraft,
  clearFreeInvoiceDraft,
  defaultDraft,
  readFreeInvoiceDraft,
  templateToDraft,
  writeFreeInvoiceDraft,
} from "@/lib/freeInvoiceDraft";

const MAX_PAGES = 3;
const TOO_LARGE = "These pages are too large to send together (about 2.5MB total). Use smaller photos or a lower-resolution PDF.";

type Stage = "start" | "pages" | "editor";

const ENGINES: { value: ScanEngine; label: string }[] = [
  { value: "gemini", label: "Gemini (fast, free)" },
  { value: "claude", label: "Claude" },
];

function EnginePicker({ value, onChange, disabled }: { value: ScanEngine; onChange: (v: ScanEngine) => void; disabled?: boolean }) {
  return (
    <div className={disabled ? "opacity-50" : ""}>
      <p className="text-xs text-neutral-500">Read with</p>
      <Segmented className="mt-1" label="Read with" value={value} options={ENGINES} onChange={disabled ? () => {} : onChange} />
    </div>
  );
}

export default function FreeInvoiceBuilder() {
  const router = useRouter();
  const { user } = useAuth();
  // Rendered client-only (see the page), so the saved draft can seed
  // state directly instead of arriving in an effect after first paint.
  const [draft, setDraft] = useState<FreeInvoiceDraft | null>(readFreeInvoiceDraft);
  const [stage, setStage] = useState<Stage>(draft ? "editor" : "start");
  const [engine, setEngine] = useState<ScanEngine>("gemini");
  const [pages, setPages] = useState<CapturedFile[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [note, setNote] = useState<"resumed" | "filled" | null>(draft ? "resumed" : null);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [printing, setPrinting] = useState(false);
  const editing = stage === "editor" && !!draft;
  const pageChars = pages.reduce((s, p) => s + p.dataUrl.length, 0);
  // Read generation: adding a page mid-read starts a new one and the
  // older result is dropped.
  const runRef = useRef(0);

  useEffect(() => {
    if (stage === "editor" && draft) writeFreeInvoiceDraft(draft);
  }, [draft, stage]);

  // The browser's own print (Cmd+P, the menu) fires beforeprint with no
  // chance to wait for a render, so the portal is mounted synchronously.
  useEffect(() => {
    if (!editing) return;
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [editing]);

  useLayoutEffect(() => {
    if (!printing) return;
    document.body.classList.add("printing-invoice");
    return () => document.body.classList.remove("printing-invoice");
  }, [printing]);

  function print() {
    flushSync(() => setPrinting(true));
    window.print();
  }

  function startBlank() {
    setDraft(defaultDraft());
    setNote(null);
    setStage("editor");
  }

  async function readInvoice(toRead: CapturedFile[]) {
    const run = ++runRef.current;
    setReading(true);
    setReadError(null);
    try {
      if (toRead.reduce((s, p) => s + p.dataUrl.length, 0) > MAX_BATCH_CHARS) throw new Error(TOO_LARGE);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const payload: { images: string[]; engine?: ScanEngine } = { images: toRead.map((p) => p.dataUrl) };
      if (user) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          headers.Authorization = `Bearer ${session.access_token}`;
          payload.engine = engine;
        }
      }
      const res = await fetch("/api/invoice-template", { method: "POST", headers, body: JSON.stringify(payload) });
      const body = (await res.json().catch(() => null)) as { template?: InvoiceTemplate; error?: string } | null;
      if (run !== runRef.current) return;
      if (!body) throw new Error(res.status === 413 ? TOO_LARGE : "Couldn't read the invoice.");
      if (!res.ok || !body.template) throw new Error(body.error ?? "Couldn't read the invoice.");
      setDraft(templateToDraft(body.template));
      setNote("filled");
      setPages([]);
      setTab("edit");
      setStage("editor");
    } catch (err) {
      if (run !== runRef.current) return;
      setReadError(err instanceof Error ? err.message : "Couldn't read the invoice.");
    } finally {
      if (run === runRef.current) setReading(false);
    }
  }

  function startOver() {
    if (!window.confirm("Start over? This invoice will be cleared.")) return;
    clearFreeInvoiceDraft();
    setDraft(null);
    setPages([]);
    setNote(null);
    setReadError(null);
    setStage("start");
  }

  function addPage(file: CapturedFile) {
    const next = [...pages, file];
    setPages(next);
    setCapturing(false);
    setStage("pages");
    readInvoice(next);
  }

  function cancelPages() {
    runRef.current++;
    setReading(false);
    setPages([]);
    setReadError(null);
    setStage("start");
  }

  function saveToAccount() {
    if (draft) writeFreeInvoiceDraft(draft);
    router.push(user ? "/invoices/new" : "/login?next=/invoices/new");
  }

  if (capturing) {
    return (
      <DocumentCapture
        onCapture={addPage}
        onClose={() => setCapturing(false)}
        pageNumber={pages.length + 1}
      />
    );
  }

  const actions = (
    <>
      <button type="button" onClick={print} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        Print or save as PDF
      </button>
      <button type="button" onClick={saveToAccount} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
        Save to your account
      </button>
      <button type="button" onClick={startOver} className="px-2 py-2 text-sm font-medium text-neutral-600">
        Start over
      </button>
    </>
  );

  return (
    <div className={`space-y-6 ${stage === "editor" ? "pb-28 sm:pb-0" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Free invoice</h1>
          <p className="mt-1 text-neutral-600">Build an invoice and print it or save it as a PDF. No account needed.</p>
        </div>
        {stage === "editor" && <div className="hidden items-center gap-2 sm:flex">{actions}</div>}
      </div>

      {stage === "start" && (
        <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <h2 className="font-semibold">How do you want to start?</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col rounded-lg border p-4">
              <p className="font-medium">Start blank</p>
              <p className="mt-1 flex-1 text-sm text-neutral-600">Type in the details and watch the invoice build itself alongside.</p>
              <button type="button" onClick={startBlank} className="mt-3 w-fit rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
                Start blank
              </button>
            </div>
            <div className="flex flex-col rounded-lg border p-4">
              <p className="font-medium">Scan an existing invoice</p>
              <p className="mt-1 flex-1 text-sm text-neutral-600">Photograph one you have sent before. Its layout and details are copied in, so you only change what is new.</p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <CaptureButton onOpen={() => setCapturing(true)} onCapture={addPage} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
                  Scan an existing invoice
                </CaptureButton>
                {user && <EnginePicker value={engine} onChange={setEngine} />}
              </div>
            </div>
          </div>
        </div>
      )}

      {stage === "pages" && (
        <div className="space-y-4 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <div>
            <h2 className="font-semibold">Your invoice pages</h2>
            <p className="mt-1 text-sm text-neutral-600">Up to {MAX_PAGES} pages. Each page is read as soon as it arrives; adding another re-reads them all.</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {pages.map((p, i) => (
              <div key={i} className="shrink-0">
                <div className="relative h-24 w-[4.5rem]">
                  {p.mediaType === "application/pdf" ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg border bg-neutral-50 text-xs text-neutral-500">
                      <DocumentIcon className="h-5 w-5" />
                      PDF
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.dataUrl} alt={`Page ${i + 1}`} className="h-full w-full rounded-lg border object-cover" />
                  )}
                  <span className="absolute bottom-1 left-1 rounded-full bg-neutral-900/70 px-1.5 text-[10px] font-medium text-white">{i + 1}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPages((ps) => ps.filter((_, j) => j !== i))}
                  disabled={reading}
                  aria-label={`Remove page ${i + 1}`}
                  className="mt-1 w-full text-center text-xs font-medium text-neutral-600 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          {user && <EnginePicker value={engine} onChange={setEngine} disabled={reading} />}
          {readError && (
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">{readError}</p>
              <button type="button" onClick={() => readInvoice(pages)} disabled={!pages.length} className="mt-2 rounded-lg border px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-50">
                Read again
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {reading && <p className="text-sm text-neutral-600">Reading your invoice…</p>}
            <CaptureButton
              onOpen={() => setCapturing(true)}
              onCapture={addPage}
              disabled={pages.length >= MAX_PAGES || pageChars >= MAX_BATCH_CHARS}
              className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50"
            >
              Add another page
            </CaptureButton>
            <button type="button" onClick={cancelPages} className="px-2 py-2 text-sm font-medium text-neutral-600">
              Cancel
            </button>
          </div>
        </div>
      )}

      {stage === "editor" && draft && (
        <>
          {note && (
            <p className="text-sm text-neutral-600">
              {note === "filled" ? "Filled in from your invoice — check every field." : "Picked up where you left off."}{" "}
              {note === "resumed" && (
                <button type="button" onClick={startOver} className="font-medium underline">
                  Start over
                </button>
              )}
            </p>
          )}
          <Segmented
            className="sm:hidden"
            label="Editor view"
            value={tab}
            options={[{ value: "edit", label: "Edit" }, { value: "preview", label: "Preview" }]}
            onChange={setTab}
          />
          <div className="grid gap-6 sm:grid-cols-2">
            <div className={tab === "edit" ? "min-w-0" : "hidden min-w-0 sm:block"}>
              <DraftEditor draft={draft} onChange={setDraft} />
            </div>
            <div className={tab === "preview" ? "min-w-0" : "hidden min-w-0 sm:block"}>
              <div className="sm:sticky sm:top-4 sm:max-h-[calc(100vh-2rem)] sm:overflow-y-auto">
                <ScaledPreview>
                  <InvoiceDocument draft={draft} />
                </ScaledPreview>
              </div>
            </div>
          </div>
          <div
            className="fixed inset-x-0 bottom-0 z-10 flex flex-wrap items-center gap-2 border-t bg-white p-3 sm:hidden"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          >
            {actions}
          </div>
          {printing &&
            createPortal(
              <div className="print-only-document">
                <InvoiceDocument draft={draft} />
              </div>,
              document.body
            )}
        </>
      )}
    </div>
  );
}
