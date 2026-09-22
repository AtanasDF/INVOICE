"use client";

import Link from "next/link";
import { useState } from "react";
import DocumentCapture, { CapturedFile } from "@/components/DocumentCapture";
import UploadFilesButton from "@/components/UploadFilesButton";
import { useAuth } from "@/lib/authContext";
import { supabase } from "@/lib/supabaseClient";
import { DocPage, pageCount, pagesToPdf, pdfName } from "@/lib/documentPdf";
import { shortDate } from "@/lib/dates";
import { todayISO } from "@/lib/today";
import { SITE_NAME } from "@/lib/siteName";

// Copy any paper: photos (straightened by the scanner) or files, in order,
// into one PDF to save, share or email. Nothing is read by the AI and
// nothing is kept: the pages live in this page until it is left.
const BIG = "flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-center text-lg font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900";
const SMALL = "rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50";

type Made = { blob: Blob; name: string; pages: number };

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(",") + 1));
    r.onerror = () => reject(new Error("Couldn't read the file."));
    r.readAsDataURL(blob);
  });

export default function CopyDocumentPage() {
  const { user, loading } = useAuth();
  const [pages, setPages] = useState<DocPage[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [name, setName] = useState("");
  const [made, setMade] = useState<Made | null>(null);
  const [making, setMaking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendTo, setSendTo] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const fallbackName = `Document ${shortDate(todayISO())}`;

  function add(more: DocPage[]) {
    setPages((prev) => [...prev, ...more]);
    setMade(null);
    setNote(null);
    setError(null);
  }

  function remove(i: number) {
    setPages((prev) => prev.filter((_, j) => j !== i));
    setMade(null);
  }

  function move(i: number, d: -1 | 1) {
    setPages((prev) => {
      const t = i + d;
      if (t < 0 || t >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[t]] = [next[t], next[i]];
      return next;
    });
    setMade(null);
  }

  async function make(): Promise<Made | null> {
    if (made) return made;
    setMaking(true);
    setError(null);
    try {
      const filename = pdfName(name, fallbackName);
      const bytes = await pagesToPdf(pages, filename.replace(/\.pdf$/, ""));
      const next = { blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), name: filename, pages: await pageCount(pages) };
      setMade(next);
      return next;
    } catch {
      setError("Couldn't put the pages into one file. Remove the last page added and try again.");
      return null;
    } finally {
      setMaking(false);
    }
  }

  async function save() {
    const m = await make();
    if (!m) return;
    const url = URL.createObjectURL(m.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = m.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setNote(`Saved as ${m.name}.`);
  }

  async function share() {
    const m = await make();
    if (!m) return;
    const file = new File([m.blob], m.name, { type: "application/pdf" });
    if (!navigator.canShare?.({ files: [file] })) {
      setError("This browser can't share files. Save it instead, then send it from your files.");
      return;
    }
    try {
      await navigator.share({ files: [file], title: m.name });
      setNote("Shared.");
    } catch {
      // Closing the share sheet is not a failure.
    }
  }

  async function email(e: React.FormEvent) {
    e.preventDefault();
    const m = await make();
    if (!m) return;
    setSending(true);
    setError(null);
    setNote(null);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/send-document", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
        body: JSON.stringify({ to: sendTo.trim(), filename: m.name, pdf: await toBase64(m.blob), message }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; to?: string };
      if (!res.ok) throw new Error(body.error || "It couldn't be sent. Try again in a minute.");
      setNote(`Sent to ${body.to ?? sendTo.trim()}.`);
      setSendTo("");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "It couldn't be sent. Try again in a minute.");
    } finally {
      setSending(false);
    }
  }

  if (capturing) {
    return (
      <DocumentCapture
        purpose="copy"
        onBatch={(docs: CapturedFile[][]) => {
          setCapturing(false);
          add(docs.flat());
        }}
        onClose={() => setCapturing(false)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-[2rem] font-bold leading-tight sm:text-4xl">Copy a document</h1>
        <p className="mt-2 text-lg text-neutral-700">
          Photograph any paper — a letter, a form, a receipt. Each page is straightened, and they all go into one file you can
          save or send.
        </p>
      </div>

      {loading ? null : !user ? (
        <div className="space-y-2 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <p className="text-base text-neutral-700">It needs a free sign-in first. Nothing to pay.</p>
          <Link href="/login?next=%2Fcopy" className={`${BIG} bg-neutral-900 text-white`}>
            Sign in to copy a document
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setCapturing(true)} className={`${BIG} bg-neutral-900 text-white`}>
              {pages.length ? "Take more photos" : "Take photos"}
            </button>
            <UploadFilesButton
              onFiles={(files, failed) => {
                add(files);
                if (failed) setError(`${failed} ${failed === 1 ? "file" : "files"} couldn't be read and ${failed === 1 ? "was" : "were"} left out.`);
              }}
              label={pages.length ? "Add from files" : "Choose files"}
              buttonClassName={`${BIG} border-2 border-neutral-900 bg-white text-neutral-900`}
            />
          </div>

          {pages.length > 0 && (
            <div className="space-y-4 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
              <h2 className="text-lg font-bold">
                {pages.length} {pages.length === 1 ? "page" : "pages"}
              </h2>
              <ol className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {pages.map((p, i) => (
                  <li key={i} className="space-y-1">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-lg border bg-neutral-50">
                      {p.mediaType === "application/pdf" ? (
                        <div className="flex h-full items-center justify-center text-sm text-neutral-600">File</div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.dataUrl} alt={`Page ${i + 1}`} className="h-full w-full object-cover" />
                      )}
                      <span className="absolute bottom-1 left-1 rounded-full bg-neutral-900/80 px-1.5 text-xs font-medium text-white">{i + 1}</span>
                    </div>
                    <div className="flex items-center justify-between gap-1 text-xs">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move page ${i + 1} earlier`} className="h-8 w-8 rounded-md border text-neutral-700 disabled:opacity-30">
                        ←
                      </button>
                      <button type="button" onClick={() => remove(i)} aria-label={`Remove page ${i + 1}`} className="px-1 text-neutral-600 underline">
                        Remove
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === pages.length - 1} aria-label={`Move page ${i + 1} later`} className="h-8 w-8 rounded-md border text-neutral-700 disabled:opacity-30">
                        →
                      </button>
                    </div>
                  </li>
                ))}
              </ol>

              <div>
                <label htmlFor="copy-name" className="text-base text-neutral-700">Name for the file</label>
                <input
                  id="copy-name"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-base"
                  placeholder={fallbackName}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setMade(null);
                  }}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={save} disabled={making} className={`${BIG} bg-neutral-900 text-white disabled:opacity-50`}>
                  {making ? "Making the file…" : "Save the file"}
                </button>
                <button type="button" onClick={share} disabled={making} className={`${BIG} border-2 border-neutral-900 bg-white text-neutral-900 disabled:opacity-50`}>
                  Share
                </button>
              </div>

              <form onSubmit={email} className="space-y-2 border-t pt-4">
                <h3 className="font-semibold">Or email it to someone</h3>
                <label htmlFor="copy-to" className="text-sm text-neutral-700">Their email address</label>
                <input id="copy-to" type="email" required className="w-full rounded-lg border px-3 py-2 text-base" value={sendTo} onChange={(e) => setSendTo(e.target.value)} />
                <label htmlFor="copy-message" className="text-sm text-neutral-700">A note (optional)</label>
                <textarea id="copy-message" rows={2} className="w-full rounded-lg border px-3 py-2 text-base" value={message} onChange={(e) => setMessage(e.target.value)} />
                <button disabled={sending || making} className={SMALL}>
                  {sending ? "Sending…" : "Send"}
                </button>
                <p className="text-xs text-neutral-600">It goes from {SITE_NAME} with your email address to reply to.</p>
              </form>

              {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
              {note && <p className="text-sm text-neutral-700">{note}</p>}
              <p role="status" className="sr-only">{note ?? ""}</p>
            </div>
          )}
          {pages.length === 0 && error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <p className="text-sm text-neutral-600">Nothing is kept: the pages stay on this screen until you leave it.</p>
        </>
      )}
    </div>
  );
}
