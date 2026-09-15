"use client";

import { useEffect, useState } from "react";
import { Client, Receipt, businessProfileStore, clientsStore, receiptsStore } from "@/lib/storage";
import { effectiveCategories } from "@/lib/categories";
import { isPdfDataUrl } from "@/lib/fileType";

type DraftState = {
  vendor: string;
  date: string;
  category: string;
  totalAmount: string;
  vatAmount: string;
  notes: string;
};

function draftFor(r: Receipt): DraftState {
  return {
    vendor: r.vendor,
    date: r.date,
    category: r.category,
    totalAmount: (r.amount + r.vatAmount).toFixed(2),
    vatAmount: r.vatAmount.toFixed(2),
    notes: r.notes,
  };
}

export default function ReviewQueuePage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([receiptsStore.all(), clientsStore.all(), businessProfileStore.get()]).then(([r, c, profile]) => {
      const pending = r.filter((x) => x.needsReview);
      setReceipts(pending);
      setClients(c);
      setCategories(effectiveCategories(profile.customCategories));
      setDrafts(Object.fromEntries(pending.map((x) => [x.id, draftFor(x)])));
      setLoading(false);
    });
  }, []);

  function updateDraft(id: string, patch: Partial<DraftState>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function clientName(id: string) {
    return clients.find((c) => c.id === id)?.name || "";
  }

  async function approve(r: Receipt) {
    const draft = drafts[r.id];
    setError(null);
    setBusyId(r.id);
    try {
      const total = parseFloat(draft.totalAmount) || 0;
      const vat = parseFloat(draft.vatAmount) || 0;
      await receiptsStore.update(r.id, {
        vendor: draft.vendor,
        date: draft.date,
        category: draft.category,
        amount: Math.max(0, total - vat),
        vatAmount: vat,
        notes: draft.notes,
        needsReview: false,
      });
      setReceipts((prev) => prev.filter((x) => x.id !== r.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this receipt.");
    } finally {
      setBusyId(null);
    }
  }

  async function discard(r: Receipt) {
    setError(null);
    setBusyId(r.id);
    try {
      await receiptsStore.remove(r.id);
      setReceipts((prev) => prev.filter((x) => x.id !== r.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove this receipt.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Needs review</h1>
        <p className="mt-1 text-neutral-600">
          Receipts that came in by email — check what the AI read off them before they count toward your records.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {receipts.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing waiting on review.</p>
      ) : (
        <div className="space-y-4">
          {receipts.map((r) => {
            const draft = drafts[r.id];
            if (!draft) return null;
            const isPdf = r.imageDataUrl ? isPdfDataUrl(r.imageDataUrl) : false;
            const busy = busyId === r.id;
            return (
              <div key={r.id} className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
                <div className="flex items-start gap-4">
                  {r.imageDataUrl ? (
                    isPdf ? (
                      <div className="flex h-20 w-20 flex-shrink-0 flex-col items-center justify-center rounded-lg border bg-neutral-50 text-xs text-neutral-500">
                        <span className="text-2xl">📄</span>
                        PDF
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.imageDataUrl} alt="" className="h-20 w-20 flex-shrink-0 rounded-lg border object-cover" />
                    )
                  ) : (
                    <div className="flex h-20 w-20 flex-shrink-0 flex-col items-center justify-center rounded-lg border bg-neutral-50 text-xs text-neutral-500 text-center">
                      No attachment
                    </div>
                  )}

                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        className="rounded-lg border px-3 py-2 text-sm"
                        placeholder="Vendor"
                        value={draft.vendor}
                        onChange={(e) => updateDraft(r.id, { vendor: e.target.value })}
                      />
                      <input
                        type="date"
                        className="rounded-lg border px-3 py-2 text-sm"
                        value={draft.date}
                        onChange={(e) => updateDraft(r.id, { date: e.target.value })}
                      />
                    </div>

                    <select
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      value={draft.category}
                      onChange={(e) => updateDraft(r.id, { category: e.target.value })}
                    >
                      <option value="">No category</option>
                      {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>

                    <div className="grid grid-cols-2 gap-3">
                      <input
                        className="rounded-lg border px-3 py-2 text-sm"
                        placeholder="Total (£, incl. VAT)"
                        value={draft.totalAmount}
                        onChange={(e) => updateDraft(r.id, { totalAmount: e.target.value })}
                        inputMode="decimal"
                      />
                      <input
                        className="rounded-lg border px-3 py-2 text-sm"
                        placeholder="Of which VAT (£)"
                        value={draft.vatAmount}
                        onChange={(e) => updateDraft(r.id, { vatAmount: e.target.value })}
                        inputMode="decimal"
                      />
                    </div>
                    {r.originalCurrency && r.originalAmount != null && (
                      <p className="text-xs text-neutral-500">
                        Originally {r.originalCurrency} {r.originalAmount.toFixed(2)} — converted at the time using a
                        rate of {r.fxRate?.toFixed(4)}. Edit the GBP figures above if that looks off.
                      </p>
                    )}

                    <textarea
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      placeholder="Notes"
                      value={draft.notes}
                      onChange={(e) => updateDraft(r.id, { notes: e.target.value })}
                      rows={2}
                    />

                    {r.clientId && <p className="text-xs text-neutral-500">Filed under {clientName(r.clientId)}.</p>}

                    <div className="flex gap-3">
                      <button
                        onClick={() => approve(r)}
                        disabled={busy}
                        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {busy ? "Saving…" : "Looks good"}
                      </button>
                      <button
                        onClick={() => discard(r)}
                        disabled={busy}
                        className="rounded-lg border px-4 py-2 text-sm font-medium text-red-600 disabled:opacity-50"
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
