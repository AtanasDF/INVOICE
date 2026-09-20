"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Feedback, feedbackStore } from "@/lib/storage";
import { loadFailed, saveFailed } from "@/lib/errorText";

const CATEGORIES = ["Bug", "Confusing", "Missing feature", "Other"];

export default function FeedbackPage() {
  const pathname = usePathname();
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    feedbackStore
      .all()
      .then(setItems)
      .catch((err) => setError(loadFailed(err, "what you've noted before", "You can still add to it.")))
      .finally(() => setLoading(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setError(null);
    setSaving(true);
    try {
      const created = await feedbackStore.add({ message, category, page: pathname });
      setItems((prev) => [created, ...prev]);
      setMessage("");
    } catch (err) {
      setError(saveFailed(err, "Could not send feedback."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Feedback</h1>
        <p className="mt-1 text-neutral-600">
          Trying this out? Note anything that&apos;s wrong, confusing, or missing — it&apos;s saved here for review.
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
        {error && <p className="text-sm text-red-600">{error}</p>}
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
