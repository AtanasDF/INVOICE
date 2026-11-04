"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AccountKind, BusinessProfile, SavableBusinessProfile, businessProfileStore, invoicesStore } from "@/lib/storage";
import { effectiveCategories } from "@/lib/categories";
import { safePaymentLink } from "@/lib/paymentLink";
import { signOut } from "@/lib/signOut";
import { leaveTo, useNavigationGuard, type LeaveTo } from "@/lib/leaveGuard";
import { ReminderKind } from "@/lib/reminderTemplates";
import { parseSequenceNumber } from "@/lib/invoiceNumber";
import { loadFailed, saveFailed } from "@/lib/errorText";

export const CARD = "space-y-3 rounded-xl bg-white p-4 sm:p-5 text-neutral-900 shadow-sm";
export const SMALL_BUTTON = "rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50";

export type FormValues = {
  businessName: string;
  registeredName: string;
  companyNumber: string;
  accountKind: AccountKind | null;
  vatNumber: string;
  address: string;
  showOverdueReminders: boolean;
  categories: string[];
  invoicePrefix: string;
  invoiceNextNumber: string;
  vatRegistered: boolean;
  bankDetails: string;
  paymentLink: string;
  reminderTexts: Record<ReminderKind, string>;
  latePaymentInterest: boolean;
  logoUrl: string | null;
};
export type FormKey = keyof FormValues;

function formFrom(p: BusinessProfile): FormValues {
  return {
    businessName: p.businessName,
    registeredName: p.registeredName,
    companyNumber: p.companyNumber,
    accountKind: p.accountKind,
    vatNumber: p.vatNumber,
    address: p.address,
    showOverdueReminders: p.showOverdueReminders,
    categories: effectiveCategories(p.customCategories, p.accountKind),
    invoicePrefix: p.invoicePrefix,
    invoiceNextNumber: String(p.invoiceNextNumber),
    vatRegistered: p.vatRegistered,
    bankDetails: p.bankDetails,
    paymentLink: p.paymentLink,
    reminderTexts: {
      before: p.reminderTextBefore ?? "",
      due: p.reminderTextDue ?? "",
      after: p.reminderTextAfter ?? "",
      late: p.reminderTextLate ?? "",
      final: p.reminderTextFinal ?? "",
    },
    latePaymentInterest: p.reminderLatePaymentInterest,
    logoUrl: p.logoUrl ?? null,
  };
}

// What a form field writes to the profile. Only this page's own fields are
// passed in; everything else is written back as it stands in the database now.
function profileFrom(v: Partial<FormValues>): Partial<SavableBusinessProfile> {
  const out: Partial<SavableBusinessProfile> = {};
  for (const key of Object.keys(v) as FormKey[]) {
    if (key === "categories") out.customCategories = v.categories;
    else if (key === "paymentLink") out.paymentLink = safePaymentLink(v.paymentLink ?? "") ?? "";
    else if (key === "latePaymentInterest") out.reminderLatePaymentInterest = v.latePaymentInterest;
    else if (key === "reminderTexts" && v.reminderTexts) {
      out.reminderTextBefore = v.reminderTexts.before.trim() || null;
      out.reminderTextDue = v.reminderTexts.due.trim() || null;
      out.reminderTextAfter = v.reminderTexts.after.trim() || null;
      out.reminderTextLate = v.reminderTexts.late.trim() || null;
      out.reminderTextFinal = v.reminderTexts.final.trim() || null;
    } else if (key !== "invoiceNextNumber") Object.assign(out, { [key]: v[key] });
  }
  return out;
}

function pick(values: FormValues, keys: readonly FormKey[]): Partial<FormValues> {
  return Object.fromEntries(keys.map((k) => [k, values[k]])) as Partial<FormValues>;
}

type Options = {
  // Read the invoices too, for the "series went backwards" warning.
  invoices?: boolean;
  // A reason not to save, said in the bar.
  check?: (v: FormValues) => string | null;
  // A last change to what is written, from what is stored now.
  adjust?: (out: SavableBusinessProfile, stored: BusinessProfile) => SavableBusinessProfile;
};

// Settings is several pages, each owning some of the profile's fields, and the
// profile is still one row saved whole. So a page writes its own fields and
// today's value of every other one, read just before the save -- writing back
// this page's copy of a field it never showed would undo a change made on
// another page or in another tab.
export function useProfileForm(keys: readonly FormKey[], options: Options = {}) {
  const router = useRouter();
  const [values, setValues] = useState<FormValues | null>(null);
  const [loaded, setLoaded] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [migrationPending, setMigrationPending] = useState(false);
  const [inboxToken, setInboxToken] = useState<string | null>(null);
  // What the counter read when this page loaded. Everything else here is
  // only ever changed by this form, but the invoice counter moves on its
  // own every time an invoice is marked sent -- in another tab, or on the
  // phone. Saving wrote the page-load value straight back over it, and
  // because the number is then already taken, the next "Mark as sent"
  // fails on the unique constraint and keeps failing (the aborted
  // transaction rolls the increment back too), so invoicing jams until
  // someone works out why and retypes the number.
  const [loadedNextNumber, setLoadedNextNumber] = useState(1);
  // Highest sequence number already used among existing invoices sharing
  // the current prefix -- lets the Next number field warn when it's set
  // lower than that, which would make the series look like it went
  // backwards rather than actually starting fresh.
  const [highestExistingNumber, setHighestExistingNumber] = useState(0);
  // The form as it was loaded or last saved. Anything different from it is
  // unsaved, which the bar at the bottom says, and a tap on a link is held
  // until the person says whether to save first.
  const [snapshot, setSnapshot] = useState<string | null>(null);
  // Where a held departure was going: a path, "back" (the browser's Back)
  // or "signout".
  const [leaving, setLeaving] = useState<string | null>(null);
  const withInvoices = !!options.invoices;
  const keyList = keys.join(",");

  useEffect(() => {
    const owned = keyList.split(",") as FormKey[];
    Promise.all([businessProfileStore.get(), withInvoices ? invoicesStore.all() : Promise.resolve([])]).then(([p, invoices]) => {
      const loaded = formFrom(p);
      setValues(loaded);
      setLoaded(p);
      setInboxToken(p.inboxToken);
      setLoadedNextNumber(p.invoiceNextNumber);
      setSnapshot(JSON.stringify(pick(loaded, owned)));
      const sequenceNumbers = invoices
        .map((inv) => parseSequenceNumber(inv.number, p.invoicePrefix))
        .filter((n): n is number => n !== null);
      setHighestExistingNumber(sequenceNumbers.length ? Math.max(...sequenceNumbers) : 0);
    })
      .catch((err) => setError(loadFailed(err, "your settings")))
      .finally(() => setLoading(false));
  }, [keyList, withInvoices]);

  const current = values ? JSON.stringify(pick(values, keys)) : null;
  const dirty = snapshot !== null && current !== snapshot;

  // A link, Sign out or Back with changes unsaved: the bar then asks.
  useNavigationGuard(dirty, setLeaving);

  function set<K extends FormKey>(key: K, value: FormValues[K] | ((prev: FormValues[K]) => FormValues[K])) {
    setValues((prev) => (prev ? { ...prev, [key]: typeof value === "function" ? (value as (p: FormValues[K]) => FormValues[K])(prev[key]) : value } : prev));
  }

  async function save(e?: React.FormEvent): Promise<boolean> {
    e?.preventDefault();
    if (!values) return false;
    setError(null);
    setSaved(false);
    const problem = options.check?.(values);
    if (problem) {
      setError(problem);
      return false;
    }
    setSaving(true);
    try {
      // An untouched field writes back today's value, not this page's. A
      // deliberate edit still wins -- that is what the field is for.
      // The import address is never edited by a form (its own button saves
      // it at once), so it is always today's: one made from the dashboard in
      // another tab was being overwritten with this page's null and stopped
      // working.
      const typed = parseInt(values.invoiceNextNumber, 10) || 1;
      const stored = await businessProfileStore.get();
      const nextNumber = keys.includes("invoiceNextNumber") && typed !== loadedNextNumber ? typed : stored.invoiceNextNumber;
      const mine = pick(values, keys);
      let out: SavableBusinessProfile = { ...stored, ...profileFrom(mine), invoiceNextNumber: nextNumber, inboxToken: stored.inboxToken };
      if (options.adjust) out = options.adjust(out, stored);
      const full = await businessProfileStore.save(out);
      setMigrationPending(!full);
      setInboxToken(stored.inboxToken);
      setLoadedNextNumber(nextNumber);
      setValues((prev) => (prev ? { ...prev, invoiceNextNumber: String(nextNumber) } : prev));
      setSnapshot(JSON.stringify({ ...mine, ...(keys.includes("invoiceNextNumber") ? { invoiceNextNumber: String(nextNumber) } : {}) }));
      setSaved(true);
      return true;
    } catch (err) {
      setError(saveFailed(err, "Couldn't save your profile."));
      return false;
    } finally {
      setSaving(false);
    }
  }

  function go(to: LeaveTo) {
    leaveTo(to, (href) => router.push(href), () => void signOut());
  }

  async function saveAndGo() {
    const to = leaving;
    setLeaving(null);
    if ((await save()) && to) go(to);
  }

  function leaveWithoutSaving() {
    const to = leaving;
    setLeaving(null);
    setSnapshot(current);
    if (to) go(to);
  }

  return {
    loaded,
    values,
    set,
    loading,
    error,
    saving,
    saved,
    dirty,
    leaving,
    setLeaving,
    migrationPending,
    inboxToken, setInboxToken,
    highestExistingNumber,
    save,
    saveAndGo,
    leaveWithoutSaving,
    // Empty boxes here would look like settings that had been wiped, and
    // saving over them would wipe them for real.
    loadError: error && snapshot === null ? error : null,
  };
}

export type ProfileForm = ReturnType<typeof useProfileForm>;

export function SettingsHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div>
      <Link href="/settings" className="text-sm text-neutral-500"><span aria-hidden="true">←</span> Settings</Link>
      <h1 className="mt-1 text-2xl font-bold">{title}</h1>
      {children}
    </div>
  );
}

// `pending` names what the database could not take yet, on the page that
// holds those fields; elsewhere nothing typed was lost and "Saved." is true.
export function SaveBar({ form, pending }: { form: ProfileForm; pending?: [what: string, need: string] }) {
  const { leaving, saving, saveAndGo, leaveWithoutSaving, setLeaving, dirty, saved, error } = form;
  const migrationPending = form.migrationPending && !!pending;
  return (
    <div
      className="sticky bottom-0 z-10 -mx-4 space-y-2 border-t bg-white/95 px-4 pt-3 pr-28 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:shadow-sm"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      {leaving ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">You have unsaved changes.</span>
          <button type="button" onClick={saveAndGo} disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save and go"}
          </button>
          <button type="button" onClick={leaveWithoutSaving} className={SMALL_BUTTON}>
            Leave without saving
          </button>
          <button type="button" onClick={() => setLeaving(null)} className="text-sm text-neutral-600 underline">
            Stay
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
          {dirty && <span className="text-sm text-neutral-600">Unsaved changes.</span>}
          {!dirty && saved && !migrationPending && <span className="text-sm text-neutral-700">Saved.</span>}
        </div>
      )}
      {error && <p id="settings-error" role="alert" className="text-sm text-red-600">{error}</p>}
      <p role="status" className="sr-only">{saved ? (migrationPending ? `Saved, apart from ${pending?.[0]}.` : "Saved.") : ""}</p>
      {saved && migrationPending && (
        <p className="text-sm text-amber-700">
          Saved, apart from {pending?.[0]}: {pending?.[1]} a database update first. Everything else is in.
        </p>
      )}
    </div>
  );
}

export function FormState({ form }: { form: ProfileForm }) {
  if (form.loading) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (form.loadError) return <p role="alert" className="text-sm text-red-600">{form.loadError}</p>;
  return null;
}
