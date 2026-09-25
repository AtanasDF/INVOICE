"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CaptureButton from "@/components/CaptureButton";
import DocumentCapture, { CapturedFile } from "@/components/DocumentCapture";
import InvoiceDocument from "@/components/invoice/InvoiceDocument";
import DraftEditor from "@/components/free-invoice/DraftEditor";
import ScaledPreview from "@/components/free-invoice/ScaledPreview";
import SendByEmail from "@/components/free-invoice/SendByEmail";
import { Segmented } from "@/components/free-invoice/fields";
import { DocumentIcon } from "@/components/icons";
import { useAuth } from "@/lib/authContext";
import { readScannerMode, useIsIOS } from "@/lib/platform";
import type { ScanEngine } from "@/lib/extractors";
import type { InvoiceTemplate } from "@/lib/invoiceTemplate";
import { MAX_BATCH_CHARS } from "@/lib/scanClient";
import { supabase } from "@/lib/supabaseClient";
import {
  FreeInvoiceDraft,
  addDays,
  clearFreeInvoiceDraft,
  defaultDraft,
  nextDraft,
  readFreeInvoiceDraft,
  templateToDraft,
  writeFreeInvoiceDraft,
} from "@/lib/freeInvoiceDraft";
import Tip from "@/components/Tip";
import SaveAsMenu, { SAVE_FORMATS, SAVE_FAILED, saveSheetAs } from "@/components/SaveAsMenu";
import { PAGE_HEIGHT, PAGE_MARGIN, PAGE_WIDTH } from "@/lib/invoicePdf";
import { saveFailed } from "@/lib/errorText";

const MAX_PAGES = 3;
const TOO_LARGE = "These pages are too large to send together (about 2.5MB total). Use smaller photos or a lower-resolution PDF.";

type Stage = "start" | "pages" | "editor";

const ENGINES: { value: ScanEngine; label: string }[] = [
  { value: "claude", label: "Claude (best)" },
  { value: "gemini", label: "Gemini (fast)" },
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
  const quote = draft?.docType === "quote";
  const [stage, setStage] = useState<Stage>(draft ? "editor" : "start");
  const [engine, setEngine] = useState<ScanEngine>("claude");
  const [pages, setPages] = useState<CapturedFile[]>([]);
  const isIOS = useIsIOS();
  // The free page's "Start from an old invoice" arrives with ?start=photo:
  // the camera opens straight away, as the chooser's photo button would.
  // Not over a draft in progress, not for a stranger (the chooser asks them
  // to sign in), and not on the iPhone's own-camera path, which only opens
  // from a tap, so the chooser's button is still the way in there.
  // Both read the address before the effect below strips ?start= from it.
  const openedForThem = () => !draft && !!user && !(isIOS && readScannerMode() === "native") && new URLSearchParams(window.location.search).get("start") === "photo";
  const [capturing, setCapturing] = useState(openedForThem);
  // Whether the camera was opened for them or by them: only the first case
  // may close itself when the camera turns out to be blocked.
  const [autoOpened] = useState(openedForThem);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  useEffect(() => {
    if (window.location.search.includes("start=")) window.history.replaceState(null, "", "/free-invoice");
  }, []);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [note, setNote] = useState<"resumed" | "filled" | "next" | null>(draft ? "resumed" : null);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [printing, setPrinting] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // The printed sheet the other formats are read from is put up only while
  // a save list is open, so typing an invoice never re-draws an A4 page.
  const [savingOpen, setSavingOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveSheet = useRef<HTMLDivElement>(null);
  // Bumped whenever a different invoice starts, so the send panel forgets
  // the last one's recipient and "Sent".
  const [invoiceGen, setInvoiceGen] = useState(0);
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

  function startBlank(docType: FreeInvoiceDraft["docType"] = "invoice") {
    const fresh = defaultDraft();
    setDraft(docType === "quote" ? { ...fresh, docType, dueDate: addDays(fresh.date, 30) } : fresh);
    setInvoiceGen((g) => g + 1);
    setNote(null);
    setTab("edit");
    setStage("editor");
  }

  // A read or "Next invoice" swaps the page under the reader: the note that
  // says what happened takes focus, so it is heard rather than just drawn.
  const noteRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (note === "filled" || note === "next") noteRef.current?.focus();
  }, [note, invoiceGen]);

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
      setInvoiceGen((g) => g + 1);
      setNote("filled");
      setPages([]);
      setTab("edit");
      setStage("editor");
    } catch (err) {
      if (run !== runRef.current) return;
      setReadError(saveFailed(err, "Couldn't read the invoice."));
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
    setTab("edit");
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

  function goToSend() {
    setTab("preview");
    setMoreOpen(false);
    requestAnimationFrame(() => document.getElementById("send-by-email")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function startNext() {
    if (!draft) return;
    setDraft(nextDraft(draft));
    setInvoiceGen((g) => g + 1);
    setNote("next");
    setTab("edit");
    window.scrollTo({ top: 0 });
  }

  function saveToAccount() {
    if (draft) writeFreeInvoiceDraft(draft);
    const to = draft?.docType === "quote" ? "/quotes/new?import=1" : "/invoices/new";
    router.push(user ? to : `/login?next=${encodeURIComponent(to)}`);
  }

  if (capturing) {
    return (
      <DocumentCapture
        onCapture={addPage}
        onClose={() => setCapturing(false)}
        // The camera we opened for them, refused. They pressed "Create an
        // invoice", not "open the camera", so the shortcut failing must not
        // leave them on a black screen hunting for a back arrow: get out of
        // the way, show the invoice, and say why. Only when we opened it --
        // somebody who tapped the camera themselves can press Try again.
        onUnavailable={autoOpened ? () => { setCapturing(false); setCameraBlocked(true); } : undefined}
        pageNumber={pages.length + 1}
      />
    );
  }

  const docName = `${quote ? "Quote" : "Invoice"} ${draft?.number ?? ""}`.trim();

  const actions = (
    <>
      {/* Signed in, this is the one that matters and it used to sit fifth,
          worded as an optional extra. The dashboard's "Create an invoice"
          lands people here, and an invoice that is printed or sent but never
          recorded is outside the accounting record: nothing chases it when it
          goes unpaid, and it counts towards neither the VAT return nor the tax
          card. A stranger still gets the old wording, which asks them to sign
          in first. */}
      {user ? (
        <button type="button" onClick={saveToAccount} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          Save to my {quote ? "quotes" : "invoices"}
        </button>
      ) : null}
      <button type="button" onClick={goToSend} className={user ? "rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700" : "rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"}>
        Send or share
      </button>
      <button type="button" onClick={print} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
        Print or save
      </button>
      <SaveAsMenu sheet={() => saveSheet.current} name={docName} onOpenChange={setSavingOpen} />
      <button type="button" onClick={startNext} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
        {quote ? "Next quote" : "Next invoice"}
      </button>
      {!user && (
        <button type="button" onClick={saveToAccount} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
          Keep a copy in the app
        </button>
      )}
      <button type="button" onClick={startOver} className="px-2 py-2 text-sm font-medium text-neutral-600">
        Start over
      </button>
    </>
  );

  // The phone bar keeps the two main actions in reach and folds the rest.
  const menuItem = "block w-full px-4 py-3 text-left text-sm font-medium text-neutral-800";
  const mobileActions = (
    <>
      {moreOpen && (
        <div className="absolute inset-x-3 bottom-full mb-2 max-h-[70vh] overflow-y-auto rounded-xl border bg-white shadow-lg">
          <p className="px-4 pt-3 text-xs text-neutral-500">Save as</p>
          {SAVE_FORMATS.map((f) => (
            <button
              key={f.kind}
              type="button"
              onClick={async () => {
                setSaveError(null);
                try {
                  if (!saveSheet.current) throw new Error("not ready");
                  await saveSheetAs(f.kind, saveSheet.current, docName);
                  setMoreOpen(false);
                } catch {
                  setSaveError(SAVE_FAILED);
                }
              }}
              className={`${menuItem} flex-col items-start`}
            >
              {f.label} <span className="font-normal text-neutral-500">{f.ending}</span>
            </button>
          ))}
          <button type="button" onClick={() => { setMoreOpen(false); startNext(); }} className={`${menuItem} border-t`}>{quote ? "Next quote" : "Next invoice"}</button>
          <button type="button" onClick={() => { setMoreOpen(false); saveToAccount(); }} className={`${menuItem} border-t`}>{user ? `Save to my ${quote ? "quotes" : "invoices"}` : "Keep a copy in the app"}</button>
          <button type="button" onClick={() => { setMoreOpen(false); startOver(); }} className={`${menuItem} border-t text-neutral-600`}>Start over</button>
        </div>
      )}
      <button type="button" onClick={goToSend} className="flex-1 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white">
        Send or share
      </button>
      <button type="button" onClick={() => setTab(tab === "edit" ? "preview" : "edit")} className="flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium text-neutral-700">
        {tab === "edit" ? "Preview" : "Edit"}
      </button>
      <button type="button" onClick={print} className="rounded-lg border px-3 py-2.5 text-sm font-medium text-neutral-700">
        Print
      </button>
      <button type="button" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} className="rounded-lg border px-3 py-2.5 text-sm font-medium text-neutral-700">
        More
      </button>
    </>
  );

  return (
    <div className={`space-y-6 ${stage === "editor" ? "pb-28 sm:pb-0" : ""}`}>
      {(savingOpen || moreOpen) && draft && createPortal(
        <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }}>
          <div ref={saveSheet} className="bg-white text-neutral-900" style={{ width: PAGE_WIDTH, minHeight: PAGE_HEIGHT, padding: PAGE_MARGIN }}>
            <InvoiceDocument draft={draft} />
          </div>
        </div>,
        document.body
      )}
      {saveError && <p role="alert" className="text-sm text-red-600">{saveError}</p>}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{quote ? "Free quote" : "Free invoice"}</h1>
          <p className="mt-1 text-neutral-600">Photograph one you&apos;ve sent before and the next is filled in for you, or build one here. Print it, save it as a file, or keep it in your invoices.</p>
        </div>
        {stage === "editor" && <div className="hidden items-center gap-2 sm:flex">{actions}</div>}
      </div>

      {stage === "start" && (
        <Tip id="free-invoice-scan">
          Tip: photograph an invoice you&apos;ve sent before, even a handwritten one, and the next one is made for you:
          same details, number moved on, dated today.
        </Tip>
      )}

      {/* The camera we opened on their behalf could not be used. Said here,
          on the page they were actually after, rather than left as a black
          screen with a back arrow on it. */}
      {cameraBlocked && stage === "start" && (
        <div role="status" className="rounded-xl border bg-neutral-50 p-4 text-neutral-900">
          <p className="text-base font-medium">The camera didn&apos;t open.</p>
          <p className="mt-1 text-base text-neutral-700">
            It&apos;s blocked for this site in your browser&apos;s settings. You can still type the invoice
            in below, or upload a photo of an old one &mdash; neither needs the camera.
          </p>
        </div>
      )}

      {stage === "start" && (
        <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <h2 className="text-xl font-bold">How would you like to start?</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col rounded-lg border p-4">
              {user ? (
                <CaptureButton onOpen={() => setCapturing(true)} onCapture={addPage} className="flex min-h-14 w-full items-center justify-center rounded-lg bg-neutral-900 px-4 py-3 text-center text-lg font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900">
                  Take a photo of an old invoice
                </CaptureButton>
              ) : (
                // Scanning costs a read each time, so it is for people who
                // have signed in (free); typing one in stays open to all.
                <Link href="/login?next=%2Ffree-invoice" className="flex min-h-14 w-full items-center justify-center rounded-lg bg-neutral-900 px-4 py-3 text-center text-lg font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900">
                  Take a photo of an old invoice
                </Link>
              )}
              <p className="mt-3 flex-1 text-base text-neutral-700">
                {user
                  ? "We copy your details in. You check them. Your phone will ask to use the camera."
                  : "We copy your details in. You check them. It needs a free sign-in first, so every read comes from a real person; anything you've typed here stays."}
              </p>
              {user && (
                <div className="mt-3">
                  <EnginePicker value={engine} onChange={setEngine} />
                </div>
              )}
            </div>
            <div className="flex flex-col rounded-lg border p-4">
              <button type="button" onClick={() => startBlank()} className="flex min-h-14 w-full items-center justify-center rounded-lg border-2 border-neutral-900 bg-white px-4 py-3 text-center text-lg font-bold text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900">
                Type it in
              </button>
              <p className="mt-3 flex-1 text-base text-neutral-700">Fill in a few boxes. We build the invoice as you go.</p>
              <button type="button" onClick={() => startBlank("quote")} className="mt-3 w-fit text-base text-neutral-700 underline">
                Start a quote
              </button>
            </div>
          </div>
          <p className="mt-4 text-base text-neutral-700">
            New customer? <Link href="/check-company" className="font-medium underline">Check the company</Link> first. It is free, straight from the Companies House register.
          </p>
          <p className="mt-2 text-base text-neutral-700">
            Need a copy of any paper? <Link href="/copy" className="font-medium underline">Copy a document</Link> into one file to save or send.
          </p>
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
              <p role="alert" className="text-sm font-medium">{readError}</p>
              <button type="button" onClick={() => readInvoice(pages)} disabled={!pages.length} className="mt-2 rounded-lg border px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-50">
                Read again
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {reading && <p className="text-sm text-neutral-600">Reading your invoice…</p>}
            <p role="status" className="sr-only">{reading ? "Reading your invoice…" : ""}</p>
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
            <p ref={noteRef} tabIndex={-1} role="status" className="text-sm text-neutral-600 outline-none">
              {note === "filled"
                ? `Copied from your invoice as the next one${draft.number ? `: number ${draft.number}` : ""}, dated today. Check every field.`
                : note === "next"
                  ? `Next invoice${draft.number ? ` (${draft.number})` : ""}, dated today. Change anything that's new.`
                  : "Picked up where you left off."}{" "}
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
              <div className="space-y-4 sm:sticky sm:top-4 sm:max-h-[calc(100vh-2rem)] sm:overflow-y-auto">
                <ScaledPreview>
                  <InvoiceDocument draft={draft} />
                </ScaledPreview>
                <SendByEmail draft={draft} resetKey={invoiceGen} />
              </div>
            </div>
          </div>
          <div
            className="fixed inset-x-0 bottom-0 z-10 flex items-center gap-2 border-t bg-white p-3 sm:hidden"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          >
            {mobileActions}
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
