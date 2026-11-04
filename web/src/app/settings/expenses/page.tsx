"use client";

import { useEffect, useRef, useState } from "react";
import { businessProfileStore } from "@/lib/storage";
import { KIND_WORD, defaultCategoriesFor, missingFor, withKindCategories } from "@/lib/categories";
import { generateInboxToken, inboxAddress } from "@/lib/inboxToken";
import { saveFailed } from "@/lib/errorText";
import Tip from "@/components/Tip";
import { CARD, SMALL_BUTTON, FormState, SaveBar, SettingsHeader, useProfileForm, type FormKey } from "@/components/settings/ProfileForm";

const KEYS: FormKey[] = ["categories"];
const NO_CATEGORY = "Add at least one category before saving.";

export default function ExpenseSettingsPage() {
  const form = useProfileForm(KEYS, {
    check: (v) => (v.categories.filter((c) => c.trim()).length === 0 ? NO_CATEGORY : null),
  });
  const { values, set, error, inboxToken, setInboxToken } = form;
  const [newCategory, setNewCategory] = useState("");
  const [inboxBusy, setInboxBusy] = useState(false);
  const inboxBusyNow = useRef(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [inboxCopied, setInboxCopied] = useState<"" | "yes" | "no">("");
  const [inboxRevealed, setInboxRevealed] = useState(false);
  const arrowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  // The arrow to put focus on once a moved category has re-rendered.
  const focusArrowRef = useRef<string | null>(null);
  const categories = values?.categories;

  useEffect(() => {
    const key = focusArrowRef.current;
    if (!key) return;
    focusArrowRef.current = null;
    // At the top or the bottom that arrow is disabled; the other one is
    // still the moved item's.
    const [row, dir] = key.split(":");
    const same = arrowRefs.current[key];
    const other = arrowRefs.current[`${row}:${dir === "-1" ? "1" : "-1"}`];
    (same && !same.disabled ? same : other)?.focus();
  }, [categories]);

  if (!values || !categories || form.loadError) {
    return (
      <div className="space-y-6">
        <SettingsHeader title="Receipts and expenses" />
        <FormState form={form} />
      </div>
    );
  }

  const { accountKind } = values;
  const missing = missingFor(categories, accountKind);

  // One press replaced a list somebody had built up, and the next Save -- made
  // perhaps only to fix the bank details -- kept the reset. So it names what
  // goes before it goes.
  function resetCategories() {
    const defaults = defaultCategoriesFor(accountKind);
    const lost = (categories ?? []).filter((c) => c.trim() && !defaults.includes(c));
    if (lost.length && !window.confirm(`Go back to the standard categories? ${lost.join(", ")} will go from the list when you press Save.`)) return;
    set("categories", defaults);
  }

  function moveCategory(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (!categories || target < 0 || target >= categories.length) return;
    set("categories", (prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    focusArrowRef.current = `${target}:${direction}`;
  }

  function renameCategory(index: number, name: string) {
    set("categories", (prev) => prev.map((c, i) => (i === index ? name : c)));
  }

  function removeCategory(index: number) {
    set("categories", (prev) => prev.filter((_, i) => i !== index));
  }

  function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = newCategory.trim();
    if (!name || categories?.includes(name)) return;
    set("categories", (prev) => [...prev, name]);
    setNewCategory("");
  }

  async function regenerateInboxToken() {
    // Two presses made two tokens, the last SAVE won, and the address shown
    // was whichever call resolved last -- so it could be the dead one.
    if (inboxBusyNow.current) return;
    // Every other destructive tap in the app asks first; the old address
    // stops working the moment a new one exists.
    if (inboxToken && !window.confirm("Get a new import address? The old one stops working straight away, and anything still being forwarded to it won't arrive.")) return;
    inboxBusyNow.current = true;
    setInboxError(null);
    setInboxBusy(true);
    try {
      const profile = await businessProfileStore.get();
      const token = generateInboxToken();
      await businessProfileStore.save({ ...profile, inboxToken: token });
      setInboxToken(token);
      setInboxRevealed(false);
    } catch (err) {
      setInboxError(saveFailed(err, "Couldn't make an address just now."));
    } finally {
      inboxBusyNow.current = false;
      setInboxBusy(false);
    }
  }

  function copyInboxAddress() {
    if (!inboxToken) return;
    // A refused write did nothing at all and left a rejection unhandled.
    navigator.clipboard.writeText(inboxAddress(inboxToken)).then(() => setInboxCopied("yes"), () => setInboxCopied("no"));
    setTimeout(() => setInboxCopied(""), 3000);
  }

  return (
    <div className="space-y-6">
      <SettingsHeader title="Receipts and expenses">
        <Tip id="settings-expenses">How it works: the categories are the choices when you save a receipt, and how your expenses add up. Renaming or removing one leaves the receipts already saved as they are.</Tip>
        <p className="mt-1 text-neutral-600">How your spending is sorted, and the address to email receipts in to.</p>
      </SettingsHeader>

      <form onSubmit={form.save} className="space-y-6">
        <div className={CARD}>
          <div>
            <h2 className="font-semibold">Expense categories</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Reorder, rename, add or remove. Removing one leaves the receipts that used it as they are.
            </p>
          </div>

          <div className="space-y-2">
            {categories.map((c, i) => (
              // Wraps: the arrows, the name and Remove are a row until the
              // text is turned up on a narrow phone, and then Remove is off
              // the side -- which is the one control in the row that cannot
              // be reached any other way.
              <div key={i} className="flex flex-wrap items-center gap-2">
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    ref={(el) => { arrowRefs.current[`${i}:-1`] = el; }}
                    onClick={() => moveCategory(i, -1)}
                    disabled={i === 0}
                    className="h-8 w-8 rounded-md border text-sm text-neutral-600 disabled:opacity-30"
                    aria-label={`Move ${c} up`}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    ref={(el) => { arrowRefs.current[`${i}:1`] = el; }}
                    onClick={() => moveCategory(i, 1)}
                    disabled={i === categories.length - 1}
                    className="h-8 w-8 rounded-md border text-sm text-neutral-600 disabled:opacity-30"
                    aria-label={`Move ${c} down`}
                  >
                    ▼
                  </button>
                </div>
                <input
                  className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
                  aria-label={`Category ${i + 1}`}
                  value={c}
                  onChange={(e) => renameCategory(i, e.target.value)}
                />
                <button type="button" onClick={() => removeCategory(i)} className="px-2 py-2 text-sm text-neutral-500 underline">
                  Remove
                </button>
              </div>
            ))}
            {categories.length === 0 && <p className="text-sm text-neutral-500">No categories — add at least one below.</p>}
          </div>

          {/* Wraps and the box may shrink: at a large text size the
              placeholder held the input at its natural width and pushed
              Add off the side. */}
          <div className="flex flex-wrap gap-2 border-t pt-3">
            <input
              className="w-full min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm sm:w-auto"
              placeholder="Add a category (e.g. Childcare)"
              aria-label="New category"
              aria-invalid={error === NO_CATEGORY || undefined}
              aria-describedby={error === NO_CATEGORY ? "settings-error" : undefined}
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addCategory(e);
              }}
            />
            <button type="button" onClick={addCategory} className="rounded-lg border px-3 py-2 text-sm font-medium text-neutral-700">
              Add
            </button>
          </div>
          {accountKind && missing.length > 0 && (
            <div className="rounded-lg border bg-neutral-50 p-3 text-sm">
              <p className="text-neutral-600">
                The {KIND_WORD[accountKind]} list also has: {missing.join(", ")}.
              </p>
              <button
                type="button"
                onClick={() => set("categories", (prev) => withKindCategories(prev, accountKind))}
                className="mt-2 rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700"
              >
                Add them
              </button>
            </div>
          )}
          <button type="button" onClick={resetCategories} className="text-sm text-neutral-500 underline">
            Reset to defaults
          </button>
        </div>

        <SaveBar form={form} />
      </form>

      <div className={CARD}>
        <div>
          <h2 className="font-semibold">Email import</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Forward a receipt to your own address below and it&apos;ll show up under{" "}
            <a href="/receipts/review" className="underline">Needs review</a> for you to check before it becomes a
            real receipt — nobody&apos;s watching the way you are on the scan screen, so nothing from email goes
            straight in unchecked.
          </p>
        </div>
        {inboxError && <p role="alert" className="text-sm text-red-600">{inboxError}</p>}
        {inboxToken ? (
          <>
            <p className="text-xs font-medium text-amber-700">
              Treat this address like a password. Anyone who has it can send mail that creates receipts in your
              account — don&apos;t post it publicly, and get a new one below if it ever ends up somewhere it
              shouldn&apos;t.
            </p>
            {/* The address on a line of its own, the buttons on the next: on a phone the three never fitted one row. */}
            <code className="block overflow-x-auto whitespace-nowrap rounded-lg border bg-neutral-50 px-3 py-2 text-sm">
              {inboxRevealed ? inboxAddress(inboxToken) : `u-${"•".repeat(12)}@invoiceover.com`}
            </code>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setInboxRevealed((v) => !v)} className="rounded-lg border px-3 py-2 text-sm font-medium text-neutral-700">
                {inboxRevealed ? "Hide" : "Show"}
              </button>
              <button type="button" onClick={copyInboxAddress} className="rounded-lg border px-3 py-2 text-sm font-medium text-neutral-700">
                {inboxCopied === "yes" ? "Copied" : inboxCopied === "no" ? "Couldn't copy" : "Copy"}
              </button>
              <span role="status" className="sr-only">{inboxCopied === "yes" ? "Address copied." : inboxCopied === "no" ? "Couldn't copy the address." : ""}</span>
              <button type="button" onClick={regenerateInboxToken} disabled={inboxBusy} className={SMALL_BUTTON}>
                {inboxBusy ? "Working…" : "Get a new address"}
              </button>
            </div>
            <p className="text-xs text-neutral-500">
              A new address stops the old one working straight away — use it if the address ever ends up somewhere you
              didn&apos;t intend.
            </p>
          </>
        ) : (
          <button type="button" onClick={regenerateInboxToken} disabled={inboxBusy} className={SMALL_BUTTON}>
            {inboxBusy ? "Making it…" : "Get an address to email receipts to"}
          </button>
        )}
      </div>
    </div>
  );
}
