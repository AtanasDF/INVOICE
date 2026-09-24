"use client";

import { useEffect, useState } from "react";
import Tip from "@/components/Tip";
import { usePathname } from "next/navigation";
import { Feedback, feedbackStore } from "@/lib/storage";
import { supabase } from "@/lib/supabaseClient";
import { loadFailed } from "@/lib/errorText";

const CATEGORIES = ["Bug", "Confusing", "Missing feature", "Other"];

export default function FeedbackPage() {
  const pathname = usePathname();
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    feedbackStore
      .all()
      .then(setItems)
      .catch((err) => setError(loadFailed(err, "what you've noted before", "You can still add to it.")))
      .finally(() => setLoading(false));
  }, []);

  // Sent through the app's own route, which saves the note as this
  // person's and emails it to the maker; a failed send keeps the text.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setError(null);
    setSent(null);
    setSaving(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
        body: JSON.stringify({ message, category, page: pathname }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; createdAt?: string; emailed?: boolean; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error || "Could not send feedback. Try again in a minute.");
      setItems((prev) => [{ id: body.id!, message: message.trim(), category, page: pathname, createdAt: body.createdAt ?? new Date().toISOString() }, ...prev]);
      setMessage("");
      setSent("Sent. Thank you.");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Could not send feedback. Try again in a minute.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Feedback</h1>
        <Tip id="feedback-how">How it works: this goes straight to the person who builds the app, and your email address comes with it so you get a reply. Tell us what went wrong, or what you wish it did.</Tip>
        <p className="mt-1 text-neutral-600">
          Spotted something wrong, confusing or missing? Tell us. It goes straight to the person who makes this.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <select className="w-full rounded-lg border px-3 py-2" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <textarea
          className="w-full rounded-lg border px-3 py-2"
          placeholder="What's on your mind?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
        />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {sent && <p className="text-sm text-neutral-700">{sent}</p>}
        <p role="status" className="sr-only">{sent ?? ""}</p>
        <button disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Sending…" : "Send feedback"}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        items.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-neutral-500">Previously sent</h2>
            {items.map((f) => (
              <div key={f.id} className="rounded-xl border bg-white p-4 text-neutral-900 shadow-sm">
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>{f.category || "Other"}</span>
                  <span>{new Date(f.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-sm">{f.message}</p>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
