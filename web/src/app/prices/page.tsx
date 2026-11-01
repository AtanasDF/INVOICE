"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { businessProfileStore, invoicesStore, quotesStore } from "@/lib/storage";
import {
  buildPriceList,
  editFor,
  learnPrices,
  learnedWords,
  priceWords,
  withEdit,
  type LearnedPrice,
  type PriceEdit,
  type PriceItem,
  type PriceKind,
} from "@/lib/priceList";
import { priceListStore } from "@/lib/priceListStore";
import { NumberInput } from "@/components/free-invoice/fields";
import { VAT_RATE_KINDS, VAT_RATE_LABELS, type VatRateKind } from "@/lib/vat";
import { loadFailed, saveFailed } from "@/lib/errorText";
import Tip from "@/components/Tip";

type Draft = { name: string; price: number; kind: PriceKind; vatRate: VatRateKind };
const INPUT = "w-full rounded-lg border px-3 py-2";
const NOT_YET = "Your changes can't be kept yet: the update that stores them hasn't been switched on. The prices below are worked out from your invoices and quotes.";

export default function PricesPage() {
  const [learned, setLearned] = useState<LearnedPrice[]>([]);
  const [edits, setEdits] = useState<PriceEdit[]>([]);
  const [canSave, setCanSave] = useState(true);
  const [vatRegistered, setVatRegistered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // The key being changed, or "new" for an item being added.
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", price: 0, kind: "fixed", vatRate: "standard" });
  const [saving, setSaving] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    Promise.all([invoicesStore.all(), quotesStore.all(), priceListStore.get(), businessProfileStore.get()])
      .then(([inv, quotes, saved, profile]) => {
        setLearned(learnPrices(inv, quotes));
        setEdits(saved.edits);
        setCanSave(saved.canSave);
        setVatRegistered(profile.vatRegistered);
      })
      .catch((err) => setError(loadFailed(err, "your prices")))
      .finally(() => setLoading(false));
  }, []);

  const list = useMemo(() => buildPriceList(learned, edits), [learned, edits]);
  const shown = list.filter((i) => !i.hidden);
  const hidden = list.filter((i) => i.hidden);

  async function keep(next: PriceEdit[]) {
    setSaving(true);
    setSaveError(null);
    try {
      const kept = await priceListStore.save(next);
      if (!kept) {
        setCanSave(false);
        return false;
      }
      setEdits(next);
      return true;
    } catch (err) {
      setSaveError(saveFailed(err, "Couldn't save your price. Try again."));
      return false;
    } finally {
      setSaving(false);
    }
  }

  function startChange(i: PriceItem) {
    setSaveError(null);
    setOpen(i.key);
    setDraft({ name: i.name, price: i.price, kind: i.kind, vatRate: i.vatRate });
  }

  function startAdd() {
    setSaveError(null);
    setOpen("new");
    setDraft({ name: "", price: 0, kind: "fixed", vatRate: "standard" });
  }

  async function saveDraft(i: PriceItem | null) {
    if (!draft.name.trim() || !(draft.price > 0)) {
      setSaveError("Give it a name and a price.");
      return;
    }
    const target: PriceItem = i ?? { key: `own:${crypto.randomUUID()}`, name: "", price: 0, kind: "fixed", vatRate: "standard", hidden: false, learned: null, edited: true };
    const edit = editFor(target, { ...draft, hidden: target.hidden });
    if (await keep(withEdit(edits, target.key, edit))) setOpen(null);
  }

  const setHidden = (i: PriceItem, hide: boolean) =>
    keep(withEdit(edits, i.key, editFor(i, { name: i.name, price: i.price, kind: i.kind, vatRate: i.vatRate, hidden: hide })));

  // Back to what the invoices say: his change goes, the learned line stays.
  const backToLearned = async (i: PriceItem) => {
    if (await keep(withEdit(edits, i.key, i.hidden ? { key: i.key, hidden: true } : null))) setOpen(null);
  };

  const form = (i: PriceItem | null) => (
    <div className="mt-3 space-y-3 border-t pt-3">
      <div>
        <label className="text-xs text-neutral-500" htmlFor="price-name">Name on the invoice</label>
        <input id="price-name" className={INPUT} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Fit a door" />
      </div>
      <fieldset>
        <legend className="text-xs text-neutral-500">How you charge it</legend>
        <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1 text-sm font-medium">
          {(["fixed", "hourly"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={draft.kind === k}
              onClick={() => setDraft({ ...draft, kind: k })}
              className={`rounded-lg px-3 py-2 ${draft.kind === k ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}
            >
              {k === "fixed" ? "Fixed price" : "Per hour"}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-neutral-500">{draft.kind === "hourly" ? "Price an hour, £" : "Price, £"}</label>
          <NumberInput className={`${INPUT} text-right`} aria-label={draft.kind === "hourly" ? "Price an hour" : "Price"} value={draft.price} onChange={(price) => setDraft({ ...draft, price })} />
        </div>
        {vatRegistered && (
          <div>
            <label className="text-xs text-neutral-500" htmlFor="price-vat">VAT</label>
            <select id="price-vat" className={INPUT} value={draft.vatRate} onChange={(e) => setDraft({ ...draft, vatRate: e.target.value as VatRateKind })}>
              {VAT_RATE_KINDS.map((k) => <option key={k} value={k}>{VAT_RATE_LABELS[k]}</option>)}
            </select>
          </div>
        )}
      </div>
      {i?.learned && (
        <p className="text-xs text-neutral-500">
          From your invoices: {i.learned.description}, {learnedWords(i.learned).toLowerCase()}.
        </p>
      )}
      {saveError && <p role="alert" className="text-sm text-red-600">{saveError}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={saving} onClick={() => saveDraft(i)} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
          {saving ? "Saving…" : i ? "Save" : "Add"}
        </button>
        <button type="button" onClick={() => setOpen(null)} className="px-3 py-2 text-sm text-neutral-600">Cancel</button>
        {i?.learned && i.edited && !i.hidden && (
          <button type="button" disabled={saving} onClick={() => backToLearned(i)} className="ml-auto px-3 py-2 text-sm text-neutral-600 underline">
            Back to the learned price
          </button>
        )}
      </div>
    </div>
  );

  const row = (i: PriceItem) => (
    <li key={i.key} className="rounded-xl border bg-white p-4 text-neutral-900 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold wrap-anywhere">{i.name}</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            {i.learned ? learnedWords(i.learned) : "Added by you"}
            {i.learned && i.price !== i.learned.last ? ` · yours is ${priceWords(i)}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold tabular-nums">{priceWords(i).replace(" an hour", "")}</p>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${i.kind === "hourly" ? "bg-blue-100 text-blue-800" : "bg-neutral-100 text-neutral-800"}`}>
            {i.kind === "hourly" ? "Per hour" : "Fixed"}
          </span>
        </div>
      </div>
      {canSave && open !== i.key && (
        <div className="mt-2 flex gap-4 text-sm">
          <button type="button" onClick={() => startChange(i)} className="min-h-11 font-medium text-neutral-700 underline">Change</button>
          <button type="button" disabled={saving} onClick={() => setHidden(i, !i.hidden)} className="min-h-11 text-neutral-600 underline">
            {i.hidden ? "Show it again" : "Hide"}
          </button>
        </div>
      )}
      {open === i.key && form(i)}
    </li>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">What I charge</h1>
        <p className="mt-1 text-neutral-600">The work you charge for and your usual price, ready to tap onto an invoice or quote.</p>
      </div>
      <Tip id="prices-how">
        How it works: this list builds itself from the invoices and quotes you send. Change a price, make it per hour, or add work you
        haven&apos;t charged for yet. Not the same as <Link href="/jobs" className="underline">Jobs</Link>, which gathers one piece of
        work&apos;s invoices and receipts.
      </Tip>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!loading && !error && !canSave && <p className="rounded-lg bg-amber-100 p-3 text-sm text-amber-800">{NOT_YET}</p>}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading&hellip;</p>
      ) : error ? null : (
        <>
          {canSave &&
            (open === "new" ? (
              <div className="rounded-xl border bg-white p-4 text-neutral-900 shadow-sm">
                <h2 className="font-semibold">Add work you charge for</h2>
                {form(null)}
              </div>
            ) : (
              <button type="button" onClick={startAdd} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
                + Add a price
              </button>
            ))}
          {saveError && open === null && <p role="alert" className="text-sm text-red-600">{saveError}</p>}

          {shown.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Nothing here yet. Send an invoice or a quote and what you charged appears here{canSave ? ", or add a price yourself" : ""}.
            </p>
          ) : (
            <ul className="space-y-3">{shown.map(row)}</ul>
          )}

          {hidden.length > 0 && (
            <div>
              <button type="button" aria-expanded={showHidden} onClick={() => setShowHidden(!showHidden)} className="min-h-11 text-sm font-medium text-neutral-700 underline">
                {showHidden ? "Hide" : "Show"} {hidden.length} hidden
              </button>
              {showHidden && <ul className="mt-2 space-y-3 opacity-80">{hidden.map(row)}</ul>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
