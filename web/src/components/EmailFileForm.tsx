"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { SITE_NAME } from "@/lib/siteName";

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
}: {
  file: () => Promise<{ blob: Blob; name: string } | null>;
  heading?: string;
  idPrefix?: string;
  className?: string;
}) {
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    setNote(null);
    try {
      const made = await file();
      if (!made) throw new Error("There's nothing to send yet.");
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/send-document", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
        body: JSON.stringify({ to: to.trim(), filename: made.name, pdf: await toBase64(made.blob), message }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; to?: string };
      if (!res.ok) throw new Error(body.error || "It couldn't be sent. Try again in a minute.");
      setNote(`Sent to ${body.to ?? to.trim()}.`);
      setTo("");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "It couldn't be sent. Try again in a minute.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={send} className={className}>
      <h3 className="font-semibold">{heading}</h3>
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
