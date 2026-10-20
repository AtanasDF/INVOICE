"use client";

import { useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { SITE_NAME } from "@/lib/siteName";
import { PDF_FAILED } from "@/lib/errorText";

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Couldn't read the file."));
    reader.readAsDataURL(blob);
  });

// Emailing any document the app holds, free (Atanas, 2026-09-22: "every
// document scanned, created, uploaded, you should be able to send it via
// email to anyone for free"). The file is made only when Send is pressed;
// the route does the fencing (signed in, a real PDF, a few an hour).
export default function EmailFileForm({
  file,
  heading = "Or email it to someone",
  idPrefix = "email-file",
  className = "space-y-2 border-t pt-4",
  level = 3,
}: {
  file: () => Promise<{ blob: Blob; name: string } | null>;
  heading?: string;
  idPrefix?: string;
  className?: string;
  // An h3 under the h2 of /convert and /copy; straight under an h1 elsewhere.
  level?: 2 | 3;
}) {
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  // Two presses in one tick send the document to a third party twice. React
  // applies `disabled` on the render AFTER the first press, so the state alone
  // cannot stop it -- and an email, unlike a saved row, cannot be taken back.
  const sendingNow = useRef(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (sendingNow.current) return;
    sendingNow.current = true;
    setSending(true);
    setError(null);
    setNote(null);
    // Only the route's own sentences are shown as they come. A throw is the
    // browser's ("Load failed") or pdf-lib's, and is said in plain words.
    try {
      let made: Awaited<ReturnType<typeof file>>;
      try {
        made = await file();
      } catch (err) {
        console.error("email file: making the PDF", err);
        setError(PDF_FAILED);
        return;
      }
      if (!made) {
        setError("There's nothing to send yet.");
        return;
      }
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/send-document", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
        body: JSON.stringify({ to: to.trim(), filename: made.name, pdf: await toBase64(made.blob), message }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; to?: string };
      if (!res.ok) {
        setError(body.error || "It couldn't be sent. Try again in a minute.");
        return;
      }
      setNote(`Sent to ${body.to ?? to.trim()}.`);
      setTo("");
      setMessage("");
    } catch (err) {
      console.error("email file", err);
      setError("It couldn't be sent. Check your connection and try again.");
    } finally {
      sendingNow.current = false;
      setSending(false);
    }
  }

  return (
    <form onSubmit={send} className={className}>
      {level === 2 ? <h2 className="font-semibold">{heading}</h2> : <h3 className="font-semibold">{heading}</h3>}
      <label htmlFor={`${idPrefix}-to`} className="text-sm text-neutral-700">
        Their email address
      </label>
      <input id={`${idPrefix}-to`} type="email" required className="w-full rounded-lg border px-3 py-2 text-base" value={to} onChange={(e) => setTo(e.target.value)} />
      <label htmlFor={`${idPrefix}-message`} className="text-sm text-neutral-700">
        A note (optional)
      </label>
      <textarea id={`${idPrefix}-message`} rows={2} className="w-full rounded-lg border px-3 py-2 text-base" value={message} onChange={(e) => setMessage(e.target.value)} />
      <button disabled={sending} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {sending ? "Sending…" : "Send"}
      </button>
      <p className="text-xs text-neutral-600">It goes from {SITE_NAME} with your email address to reply to.</p>
      {note && <p className="text-sm text-neutral-700">{note}</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
