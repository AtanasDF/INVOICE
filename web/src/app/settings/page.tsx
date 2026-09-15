"use client";

import { useEffect, useState } from "react";
import {
  businessProfileStore,
  clientsStore,
  creditNotesStore,
  feedbackStore,
  invoicesStore,
  pushSubscriptionsStore,
  receiptsStore,
  recurringExpensesStore,
} from "@/lib/storage";
import { CATEGORIES, effectiveCategories } from "@/lib/categories";
import { downloadJson } from "@/lib/exportJson";
import { disablePush, enablePush, getExistingSubscription, isIosNotStandalone, pushSupported, subscriptionToRecord } from "@/lib/push";
import { generateInboxToken, inboxAddress } from "@/lib/inboxToken";

export default function SettingsPage() {
  const [businessName, setBusinessName] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [address, setAddress] = useState("");
  const [showOverdueReminders, setShowOverdueReminders] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [inboxToken, setInboxToken] = useState<string | null>(null);
  const [inboxBusy, setInboxBusy] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [inboxCopied, setInboxCopied] = useState(false);
  const [inboxRevealed, setInboxRevealed] = useState(false);

  useEffect(() => {
    businessProfileStore.get().then((p) => {
      setBusinessName(p.businessName);
      setVatNumber(p.vatNumber);
      setAddress(p.address);
      setShowOverdueReminders(p.showOverdueReminders);
      setCategories(effectiveCategories(p.customCategories));
      setInboxToken(p.inboxToken);
      setLoading(false);
    });
    getExistingSubscription().then((sub) => setPushEnabled(sub !== null));
  }, []);

  async function regenerateInboxToken() {
    setInboxError(null);
    setInboxBusy(true);
    try {
      const profile = await businessProfileStore.get();
      const token = generateInboxToken();
      await businessProfileStore.save({ ...profile, inboxToken: token });
      setInboxToken(token);
      setInboxRevealed(false);
    } catch (err) {
      setInboxError(err instanceof Error ? err.message : "Could not generate an import address.");
    } finally {
      setInboxBusy(false);
    }
  }

  function copyInboxAddress() {
    if (!inboxToken) return;
    navigator.clipboard.writeText(inboxAddress(inboxToken)).then(() => {
      setInboxCopied(true);
      setTimeout(() => setInboxCopied(false), 2000);
    });
  }

  async function togglePush() {
    setPushError(null);
    setPushBusy(true);
    try {
      if (pushEnabled) {
        const endpoint = await disablePush();
        if (endpoint) await pushSubscriptionsStore.unsubscribe(endpoint);
        setPushEnabled(false);
      } else {
        const sub = await enablePush();
        await pushSubscriptionsStore.subscribe(subscriptionToRecord(sub));
        setPushEnabled(true);
      }
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Could not update notification settings.");
    } finally {
      setPushBusy(false);
    }
  }

  function moveCategory(index: number, direction: -1 | 1) {
    setCategories((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function renameCategory(index: number, name: string) {
    setCategories((prev) => prev.map((c, i) => (i === index ? name : c)));
  }

  function removeCategory(index: number) {
    setCategories((prev) => prev.filter((_, i) => i !== index));
  }

  function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = newCategory.trim();
    if (!name || categories.includes(name)) return;
    setCategories((prev) => [...prev, name]);
    setNewCategory("");
  }

  function resetCategoriesToDefault() {
    setCategories([...CATEGORIES]);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await businessProfileStore.save({
        businessName,
        vatNumber,
        address,
        logoUrl: null,
        showOverdueReminders,
        customCategories: categories,
        inboxToken,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function exportData() {
    setExportError(null);
    setExporting(true);
    try {
      const [clients, receipts, invoices, creditNotes, feedback, recurringExpenses, profile] = await Promise.all([
        clientsStore.all(),
        receiptsStore.all(),
        invoicesStore.all(),
        creditNotesStore.all(),
        feedbackStore.all(),
        recurringExpensesStore.all(),
        businessProfileStore.get(),
      ]);
      downloadJson(`my-data-export-${new Date().toISOString().slice(0, 10)}.json`, {
        exportedAt: new Date().toISOString(),
        businessProfile: profile,
        clients,
        receipts,
        invoices,
        creditNotes,
        recurringExpenses,
        feedback,
      });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Could not export your data.");
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your business</h1>
        <p className="mt-1 text-neutral-600">
          Fill this in once — it fills in automatically on every invoice you create from now on.
        </p>
      </div>

      <form onSubmit={save} className="space-y-6">
        <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <div>
            <label className="text-xs text-neutral-500">Business name</label>
            <input
              className="w-full rounded-lg border px-3 py-2"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500">VAT number (optional)</label>
            <input
              className="w-full rounded-lg border px-3 py-2"
              value={vatNumber}
              onChange={(e) => setVatNumber(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500">Business address (optional)</label>
            <textarea
              className="w-full rounded-lg border px-3 py-2"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <p className="text-xs text-neutral-500">
            A logo can go here too once file storage is set up — not yet, so this is text-only for now.
          </p>

          <label className="flex items-center gap-2 border-t pt-3 text-sm">
            <input type="checkbox" checked={showOverdueReminders} onChange={(e) => setShowOverdueReminders(e.target.checked)} />
            Gently remind me on the dashboard about overdue invoices
          </label>
        </div>

        <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <div>
            <h2 className="font-semibold">Expense categories</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Reorder, rename, add, or remove categories to match how you actually track spending. Removing one
              doesn&apos;t change any receipt that already used it — it just stops showing up for new ones.
            </p>
          </div>

          <div className="space-y-2">
            {categories.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => moveCategory(i, -1)}
                    disabled={i === 0}
                    className="px-1 text-xs text-neutral-500 disabled:opacity-30"
                    aria-label="Move up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveCategory(i, 1)}
                    disabled={i === categories.length - 1}
                    className="px-1 text-xs text-neutral-500 disabled:opacity-30"
                    aria-label="Move down"
                  >
                    ▼
                  </button>
                </div>
                <input
                  className="flex-1 rounded-lg border px-3 py-2 text-sm"
                  value={c}
                  onChange={(e) => renameCategory(i, e.target.value)}
                />
                <button type="button" onClick={() => removeCategory(i)} className="text-sm text-red-600">
                  Remove
                </button>
              </div>
            ))}
            {categories.length === 0 && <p className="text-sm text-neutral-500">No categories — add at least one below.</p>}
          </div>

          <div className="flex gap-2 border-t pt-3">
            <input
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
              placeholder="Add a category (e.g. Childcare)"
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
          <button type="button" onClick={resetCategoriesToDefault} className="text-sm text-neutral-500 underline">
            Reset to defaults
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-700">Saved.</p>}
        <button disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      </form>

      <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <div>
          <h2 className="font-semibold">Your data</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Download everything you&apos;ve stored — clients, receipts, invoices, credit notes, recurring expenses,
            and feedback — as a single JSON file, including any scanned images and PDFs attached to your receipts.
          </p>
        </div>
        {exportError && <p className="text-sm text-red-600">{exportError}</p>}
        <button
          type="button"
          onClick={exportData}
          disabled={exporting}
          className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50"
        >
          {exporting ? "Preparing your download…" : "Download all my data"}
        </button>
      </div>

      <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <div>
          <h2 className="font-semibold">Notifications</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Get a push notification (even when this app isn&apos;t open) when an invoice is overdue or a recurring
            expense is due — a daily check, same conditions as the reminder banners on the dashboard.
          </p>
        </div>
        {!pushSupported() ? (
          <p className="text-sm text-neutral-500">This browser doesn&apos;t support push notifications.</p>
        ) : isIosNotStandalone() ? (
          <p className="text-sm text-neutral-500">
            On iPhone, first add this app to your Home Screen (Share → Add to Home Screen), then open it from
            there and come back to this page to turn notifications on — Safari only delivers push notifications to
            an installed app, not a browser tab.
          </p>
        ) : (
          <>
            {pushError && <p className="text-sm text-red-600">{pushError}</p>}
            <button
              type="button"
              onClick={togglePush}
              disabled={pushBusy}
              className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50"
            >
              {pushBusy ? "Working…" : pushEnabled ? "Turn off notifications" : "Turn on notifications"}
            </button>
          </>
        )}
      </div>

      <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <div>
          <h2 className="font-semibold">Email import</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Forward a receipt to your own address below and it&apos;ll show up under{" "}
            <a href="/receipts/review" className="underline">Needs review</a> for you to check before it becomes a
            real receipt — nobody&apos;s watching the way you are on the scan screen, so nothing from email goes
            straight in unchecked.
          </p>
        </div>
        {inboxError && <p className="text-sm text-red-600">{inboxError}</p>}
        {inboxToken ? (
          <>
            <p className="text-xs font-medium text-amber-700">
              Treat this address like a password. Anyone who has it can send mail that creates receipts in your
              account — don&apos;t post it publicly, and regenerate it below if it ever ends up somewhere it
              shouldn&apos;t.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg border bg-neutral-50 px-3 py-2 text-sm">
                {inboxRevealed ? inboxAddress(inboxToken) : `u-${"•".repeat(32)}@invoiceover.com`}
              </code>
              <button
                type="button"
                onClick={() => setInboxRevealed((v) => !v)}
                className="rounded-lg border px-3 py-2 text-sm font-medium text-neutral-700"
              >
                {inboxRevealed ? "Hide" : "Reveal"}
              </button>
              <button type="button" onClick={copyInboxAddress} className="rounded-lg border px-3 py-2 text-sm font-medium text-neutral-700">
                {inboxCopied ? "Copied" : "Copy"}
              </button>
            </div>
            <button
              type="button"
              onClick={regenerateInboxToken}
              disabled={inboxBusy}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
            >
              {inboxBusy ? "Working…" : "Regenerate address"}
            </button>
            <p className="text-xs text-neutral-500">
              Regenerating immediately stops the old address from working — use this if it ever ends up somewhere
              you didn&apos;t intend.
            </p>
          </>
        ) : (
          <button
            type="button"
            onClick={regenerateInboxToken}
            disabled={inboxBusy}
            className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50"
          >
            {inboxBusy ? "Generating…" : "Get my import address"}
          </button>
        )}
      </div>
    </div>
  );
}
