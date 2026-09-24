"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PhotoIcon, FolderIcon, UploadIcon } from "@/components/icons";
import { ScanHandoff, readUpload, stashUploads } from "@/lib/scanHandoff";

// Upload a document (Atanas, 2026-09-24: "it should give you three buttons...
// so you don't have to click three times").
//
// Three doors, each going straight where it says, instead of one door that
// opens a chooser that asks again:
//
//   Photos       the camera roll
//   Files        the phone's own file picker -- which IS iCloud Drive, Google
//                Drive, Dropbox and Downloads already, so they need no button
//                each
//   Email it in  their own private address, which the Worker already receives
//                and files for review. Built months ago and buried in Settings
//                where nobody would ever find it.
//
// Paste and drag are ways IN, not choices to offer, so they add no buttons:
// the panel is a drop zone and the page listens for a paste. Honest about
// where each works -- both are solid on a laptop and on iPad, and iPhone
// Safari rarely receives an app-to-app drag however well iOS supports it.
// Which is why Photos, working everywhere in one tap, is first.
export default function UploadPanel({ href = "/scan", inboxAddress, onMakeAddress }: {
  href?: string;
  inboxAddress?: string | null;
  // Makes one if there is not one yet. Nobody will go to Settings to ask for
  // an address they have never heard of.
  onMakeAddress?: () => Promise<string | null>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAddress, setShowAddress] = useState(false);
  const [madeAddress, setMadeAddress] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const address = inboxAddress ?? madeAddress;
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const take = useCallback(async (files: File[]) => {
    const usable = files.filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    if (!usable.length) {
      setError(files.length ? "That isn't a photo or a PDF." : null);
      return;
    }
    setBusy(true);
    setError(null);
    const read = await Promise.allSettled(usable.map(readUpload));
    if (!alive.current) return;
    const ok = read.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])) as ScanHandoff[];
    if (!ok.length) {
      setBusy(false);
      setError(usable.length === 1 ? "Couldn't read that file." : "Couldn't read those files.");
      return;
    }
    router.push(stashUploads(ok, href, usable.length - ok.length));
  }, [href, router]);

  // A screenshot pasted straight onto the page. The commonest way somebody
  // gets a receipt off a website they cannot download from.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName))) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (!files.length) return;
      e.preventDefault();
      void take(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [take]);

  // Going straight where the button says (Atanas, 2026-09-24). How close that
  // can get differs between the two, and it is worth being exact rather than
  // hopeful:
  //
  //   Files  -- an input that does not accept images skips iOS's three-way
  //             sheet altogether and opens the Files browser directly.
  //   Photos -- accept="image/*" is the very thing that makes iOS offer "Take
  //             Photo" and "Choose File" beside the library, and a web page
  //             cannot dismiss that sheet. On Android and on a laptop it goes
  //             straight to pictures; on an iPhone the library is the first row
  //             and that is as far as a web app can take it.
  const pick = (accept: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = true;
    input.onchange = () => void take(Array.from(input.files ?? []));
    input.click();
  };

  const BTN = "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-lg border bg-white px-2 py-2.5 text-center text-sm font-medium text-neutral-900";

  return (
    <section
      aria-label="Upload a document"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void take(Array.from(e.dataTransfer.files)); }}
      className={`space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm ${over ? "border-neutral-900 bg-neutral-50" : ""}`}
    >
      <div className="flex items-center gap-2">
        <UploadIcon className="h-5 w-5" />
        <h2 className="font-semibold">Upload a document</h2>
      </div>

      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => pick("image/*")} className={BTN}>
          <PhotoIcon className="h-5 w-5" />
          Photos
        </button>
        <button type="button" disabled={busy} onClick={() => pick("application/pdf")} className={BTN}>
          <FolderIcon className="h-5 w-5" />
          Files
        </button>
        <button
          type="button"
          aria-expanded={showAddress}
          onClick={async () => {
            const opening = !showAddress;
            setShowAddress(opening);
            // Made on the first tap, silently. It was null until somebody
            // visited Settings and asked for one, which nobody would.
            if (opening && !address && onMakeAddress && !making) {
              setMaking(true);
              setMadeAddress(await onMakeAddress());
              setMaking(false);
            }
          }}
          className={BTN}
        >
          <MailIcon className="h-5 w-5" />
          Email it in
        </button>
      </div>

      {busy && <p role="status" className="text-sm text-neutral-600">Reading…</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {showAddress && (
        <div className="rounded-lg border bg-neutral-50 p-3 text-sm">
          {making ? (
            <p role="status" className="text-neutral-700">Making your address&hellip;</p>
          ) : address ? (
            <>
              <p className="text-neutral-700">
                Forward any bill or receipt to this address and it lands in <strong>Needs review</strong>. It is yours alone.
              </p>
              <p className="mt-2 font-mono text-base wrap-anywhere text-neutral-900">{address}</p>
              <button
                type="button"
                onClick={() => { void navigator.clipboard.writeText(address).then(() => setCopied(true)).catch(() => setCopied(false)); }}
                className="mt-2 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white"
              >
                {copied ? "Copied" : "Copy the address"}
              </button>
            </>
          ) : (
            <p className="text-neutral-700">
              We could not make your address just now.{" "}
              <Link href="/settings" className="font-medium underline">Try from Settings</Link>, and anything you forward to it lands in Needs review.
            </p>
          )}
        </div>
      )}

      {/* Said once, quietly. Two more ways in that cost no buttons. */}
      <p className="text-xs text-neutral-500">
        You can also drag files here, or paste a screenshot.
      </p>
    </section>
  );
}

function MailIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  );
}
