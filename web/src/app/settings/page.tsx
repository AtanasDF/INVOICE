"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AccountKind,
  businessProfileStore,
  clientsStore,
  creditNotesStore,
  feedbackStore,
  invoicesStore,
  pushSubscriptionsStore,
  quotesStore,
  paymentsStore,
  receiptPagesStore,
  receiptsStore,
  recurringExpensesStore,
} from "@/lib/storage";
import { KIND_WORD, defaultCategoriesFor, effectiveCategories, isDefaultSet, missingFor, withKindCategories } from "@/lib/categories";
import { downloadJson } from "@/lib/exportJson";
import { disablePush, enablePush, getExistingSubscription, isIosNotStandalone, pushSupported, subscriptionToRecord } from "@/lib/push";
import { signOut } from "@/lib/signOut";
import { generateInboxToken, inboxAddress } from "@/lib/inboxToken";
import { DEFAULT_REMINDER_TEXT, REMINDER_SCHEDULE, ReminderKind } from "@/lib/reminderTemplates";
import { parseSequenceNumber } from "@/lib/invoiceNumber";
import { inlineImage } from "@/lib/receiptImages";
import CompanyNameInput from "@/components/CompanyNameInput";
import CompanyNumberInput from "@/components/CompanyNumberInput";
import AddressFields from "@/components/AddressFields";
import { useAuth } from "@/lib/authContext";
import { supabase } from "@/lib/supabaseClient";
import { loadFailed, saveFailed } from "@/lib/errorText";
import { todayISO } from "@/lib/today";

// A limited company must show its registered name and number on its
// invoices (Companies Act 2006 s.82); a sole trader has neither, and
// personal use has no business at all. The kind also picks the starting
// list of expense categories (src/lib/categories.ts).
const ACCOUNT_KINDS: { value: AccountKind; label: string; hint: string }[] = [
  { value: "limited", label: "A limited company", hint: "Registered at Companies House" },
  { value: "sole_trader", label: "A sole trader", hint: "Self-employed, working under your own name or a trading name" },
  { value: "personal", label: "Personal use", hint: "Keeping track of your own spending" },
];
const VAT_CHOICES: { label: string; on: boolean }[] = [
  { label: "Without VAT", on: false },
  { label: "With VAT", on: true },
];
const CARD = "space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm";
const SMALL_BUTTON = "rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50";

type FormValues = {
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
  reminderTexts: Record<ReminderKind, string>;
  latePaymentInterest: boolean;
};

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [registeredName, setRegisteredName] = useState("");
  const [companyNumber, setCompanyNumber] = useState("");
  const [accountKind, setAccountKind] = useState<AccountKind | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);
  const [signInBusy, setSignInBusy] = useState(false);
  const [signInNote, setSignInNote] = useState<string | null>(null);
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
  const [invoicePrefix, setInvoicePrefix] = useState("INV-");
  const [invoiceNextNumber, setInvoiceNextNumber] = useState("1");
  // What the counter read when this page loaded. Everything else here is
  // only ever changed by this form, but the invoice counter moves on its
  // own every time an invoice is marked sent -- in another tab, or on the
  // phone. Saving wrote the page-load value straight back over it, and
  // because the number is then already taken, the next "Mark as sent"
  // fails on the unique constraint and keeps failing (the aborted
  // transaction rolls the increment back too), so invoicing jams until
  // someone works out why and retypes the number.
  const [loadedNextNumber, setLoadedNextNumber] = useState(1);
  const [vatRegistered, setVatRegistered] = useState(false);
  const [bankDetails, setBankDetails] = useState("");
  const [reminderTexts, setReminderTexts] = useState<Record<ReminderKind, string>>({ before: "", due: "", after: "", late: "", final: "" });
  const [latePaymentInterest, setLatePaymentInterest] = useState(false);
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
  const arrowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  // The arrow to put focus on once a moved category has re-rendered.
  const focusArrowRef = useRef<string | null>(null);

  useEffect(() => {
    Promise.all([businessProfileStore.get(), invoicesStore.all()]).then(([p, invoices]) => {
      const texts = {
        before: p.reminderTextBefore ?? "",
        due: p.reminderTextDue ?? "",
        after: p.reminderTextAfter ?? "",
        late: p.reminderTextLate ?? "",
        final: p.reminderTextFinal ?? "",
      };
      const loaded: FormValues = {
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
        reminderTexts: texts,
        latePaymentInterest: p.reminderLatePaymentInterest,
      };
      setBusinessName(loaded.businessName);
      setRegisteredName(loaded.registeredName);
      setCompanyNumber(loaded.companyNumber);
      setAccountKind(loaded.accountKind);
      setVatNumber(loaded.vatNumber);
      setAddress(loaded.address);
      setShowOverdueReminders(loaded.showOverdueReminders);
      setCategories(loaded.categories);
      setInboxToken(p.inboxToken);
      setInvoicePrefix(loaded.invoicePrefix);
      setInvoiceNextNumber(loaded.invoiceNextNumber);
      setLoadedNextNumber(p.invoiceNextNumber);
      setVatRegistered(loaded.vatRegistered);
      setBankDetails(loaded.bankDetails);
      setReminderTexts(texts);
      setLatePaymentInterest(loaded.latePaymentInterest);
      setSnapshot(JSON.stringify(loaded));
      const sequenceNumbers = invoices
        .map((inv) => parseSequenceNumber(inv.number, p.invoicePrefix))
        .filter((n): n is number => n !== null);
      setHighestExistingNumber(sequenceNumbers.length ? Math.max(...sequenceNumbers) : 0);
    })
      .catch((err) => setError(loadFailed(err, "your settings")))
      .finally(() => setLoading(false));
    getExistingSubscription().then((sub) => setPushEnabled(sub !== null));
  }, []);

  const values: FormValues = {
    businessName,
    registeredName,
    companyNumber,
    accountKind,
    vatNumber,
    address,
    showOverdueReminders,
    categories,
    invoicePrefix,
    invoiceNextNumber,
    vatRegistered,
    bankDetails,
    reminderTexts,
    latePaymentInterest,
  };
  const current = JSON.stringify(values);
  const dirty = snapshot !== null && current !== snapshot;

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    // Caught before React sees the click, so neither a plain link nor a
    // Next.js one gets to navigate; the bar then asks what to do.
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      // The header's Sign out is a button, not a link, and leaves just the same.
      const signOutButton = target?.closest?.("button");
      if (signOutButton && signOutButton.textContent?.trim() === "Sign out") {
        e.preventDefault();
        e.stopPropagation();
        setLeaving("signout");
        return;
      }
      const a = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === "_blank") return;
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      // A link to this very page goes nowhere; let it be.
      if (new URL(a.href, window.location.href).pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaving(href);
    };
    // The browser's Back (or a swipe on the phone) is a route change with
    // no click and no unload. A copy of this entry is pushed on top, so
    // Back lands here again and can be asked about; Next's own state is
    // kept in the copy, or it would reload the page.
    const onPop = () => {
      window.history.pushState({ ...(window.history.state ?? {}), unsaved: true }, "", window.location.href);
      setLeaving("back");
    };
    window.history.pushState({ ...(window.history.state ?? {}), unsaved: true }, "", window.location.href);
    window.addEventListener("popstate", onPop);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

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

  async function regenerateInboxToken() {
    // Every other destructive tap in the app asks first; the old address
    // stops working the moment a new one exists.
    if (inboxToken && !window.confirm("Get a new import address? The old one stops working straight away, and anything still being forwarded to it won't arrive.")) return;
    setInboxError(null);
    setInboxBusy(true);
    try {
      const profile = await businessProfileStore.get();
      const token = generateInboxToken();
      await businessProfileStore.save({ ...profile, inboxToken: token });
      setInboxToken(token);
      setInboxRevealed(false);
    } catch (err) {
      setInboxError(saveFailed(err, "Could not generate an import address."));
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
      setPushError(saveFailed(err, "Could not update notification settings."));
    } finally {
      setPushBusy(false);
    }
  }

  // A starting list that was never edited follows the kind; an edited one
  // is only ever offered additions (below the list), never trimmed.
  function chooseKind(kind: AccountKind) {
    setAccountKind(kind);
    setCategories((prev) => (isDefaultSet(prev) ? defaultCategoriesFor(kind) : prev));
  }

  function moveCategory(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    setCategories((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    focusArrowRef.current = `${target}:${direction}`;
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

  async function save(e?: React.FormEvent): Promise<boolean> {
    e?.preventDefault();
    setError(null);
    setSaved(false);
    if (categories.filter((c) => c.trim()).length === 0) {
      setError("Add at least one category before saving.");
      return false;
    }
    setSaving(true);
    try {
      // An untouched field writes back today's value, not this page's. A
      // deliberate edit still wins -- that is what the field is for.
      const typed = parseInt(invoiceNextNumber, 10) || 1;
      const nextNumber = typed === loadedNextNumber ? (await businessProfileStore.get()).invoiceNextNumber : typed;
      const full = await businessProfileStore.save({
        businessName,
        registeredName,
        companyNumber,
        accountKind,
        vatNumber,
        address,
        logoUrl: null,
        showOverdueReminders,
        customCategories: categories,
        inboxToken,
        invoicePrefix,
        invoiceNextNumber: nextNumber,
        vatRegistered,
        bankDetails,
        reminderTextBefore: reminderTexts.before.trim() || null,
        reminderTextDue: reminderTexts.due.trim() || null,
        reminderTextAfter: reminderTexts.after.trim() || null,
        reminderTextLate: reminderTexts.late.trim() || null,
        reminderLatePaymentInterest: latePaymentInterest,
        reminderTextFinal: reminderTexts.final.trim() || null,
      });
      setMigrationPending(!full);
      setLoadedNextNumber(nextNumber);
      setInvoiceNextNumber(String(nextNumber));
      setSnapshot(JSON.stringify({ ...values, invoiceNextNumber: String(nextNumber) }));
      setSaved(true);
      return true;
    } catch (err) {
      setError(saveFailed(err, "Could not save your profile."));
      return false;
    } finally {
      setSaving(false);
    }
  }

  // The copy of this entry pushed while dirty sits on top of the original,
  // so going back is two steps.
  function go(to: string) {
    if (to === "back") window.history.go(-2);
    else if (to === "signout") void signOut();
    else router.push(to);
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

  // The same email Supabase sends for "forgot my password": opening it
  // signs this browser in and lands on /reset-password, so it works both
  // as a way back in and as a way to change the password.
  async function emailSignInLink() {
    if (!user?.email) return;
    setSignInNote(null);
    setSignInBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: `${window.location.origin}/reset-password` });
    setSignInNote(error ? error.message : `Sent to ${user.email}. The link signs you in and lets you set a new password.`);
    setSignInBusy(false);
  }

  async function exportData() {
    setExportError(null);
    setExporting(true);
    try {
      const [clients, receipts, receiptPages, invoices, creditNotes, quotes, payments, feedback, recurringExpenses, profile] = await Promise.all([
        clientsStore.all(),
        receiptsStore.all(),
        receiptPagesStore.all(),
        invoicesStore.all(),
        creditNotesStore.all(),
        quotesStore.all(),
        paymentsStore.all(),
        feedbackStore.all(),
        recurringExpensesStore.all(),
        businessProfileStore.get(),
      ]);
      // Stored photos are fetched and inlined, so the export holds the
      // images themselves rather than links that expire.
      const receiptsWithImages = await Promise.all(receipts.map(async (r) => ({ ...r, imageDataUrl: await inlineImage(r.imageDataUrl) })));
      const pagesWithImages = await Promise.all(receiptPages.map(async (p) => ({ ...p, imageDataUrl: (await inlineImage(p.imageDataUrl)) ?? "" })));
      downloadJson(`my-data-export-${todayISO()}.json`, {
        exportedAt: new Date().toISOString(),
        businessProfile: profile,
        clients,
        receipts: receiptsWithImages,
        receiptPages: pagesWithImages,
        invoices,
        creditNotes,
        quotes,
        payments,
        recurringExpenses,
        feedback,
      });
    } catch (err) {
      setExportError(saveFailed(err, "Could not export your data."));
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;
  // Empty boxes here would look like settings that had been wiped, and
  // saving over them would wipe them for real.
  if (error && snapshot === null) return <p role="alert" className="text-sm text-red-600">{error}</p>;

  const nextNumberTooLow = (parseInt(invoiceNextNumber, 10) || 0) <= highestExistingNumber && highestExistingNumber > 0;
  // Registered details stay on screen once they're filled in, whatever the
  // kind says, so changing your mind can't hide what's printed.
  const limited = accountKind === "limited" || !!registeredName || !!companyNumber;
  const personal = accountKind === "personal";
  const missing = missingFor(categories, accountKind);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-neutral-600">
          Your business details go on every invoice, quote and reminder. Your account and your data are at the bottom.
        </p>
      </div>

      <form onSubmit={save} className="space-y-6">
        <div className={CARD}>
          <div>
            <h2 className="font-semibold">Your business</h2>
            <p className="mt-1 text-sm text-neutral-600">Fill this in once.</p>
          </div>

          <fieldset>
            <legend className="text-xs text-neutral-500">What are you using this for?</legend>
            <div className="mt-1 space-y-1">
              {ACCOUNT_KINDS.map((k) => (
                <label key={k.value} className="flex items-start gap-2 text-sm">
                  <input
                    className="mt-1 accent-neutral-900"
                    type="radio"
                    name="account-kind"
                    checked={accountKind === k.value}
                    onChange={() => chooseKind(k.value)}
                  />
                  <span>
                    {k.label}
                    <span className="block text-xs text-neutral-500">{k.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label className="text-xs text-neutral-500" htmlFor="business-name">{personal ? "Your name" : "Business name"}</label>
            <CompanyNameInput
              id="business-name"
              className="w-full rounded-lg border px-3 py-2"
              lookupPlaceholder="Limited company? Type to find it on Companies House"
              value={businessName}
              onChange={setBusinessName}
              address={address}
              onAddress={setAddress}
              onPick={(c, fillAddress) => {
                setBusinessName(c.name);
                if (fillAddress) setAddress(fillAddress);
              }}
            />
            <p className="mt-1 text-xs text-neutral-500">
              {limited
                ? "The name customers know you by, the headline on every document. If it isn't the name on the register, fill that in below too."
                : "The name customers know you by, the headline on every document."}
            </p>
          </div>

          {limited && (
            <div className="space-y-3 rounded-lg border bg-neutral-50 p-3">
              <p className="text-sm text-neutral-600">
                A limited company must print its registered name and number on its invoices. They go small at the foot;
                your trading name stays the headline.
              </p>
              <div>
                <label className="text-xs text-neutral-500" htmlFor="registered-name">Registered company name</label>
                <CompanyNameInput
                  id="registered-name"
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="As registered at Companies House"
                  lookupPlaceholder="Type to find it on Companies House"
                  value={registeredName}
                  onChange={setRegisteredName}
                  onPick={(c) => {
                    setRegisteredName(c.name);
                    setCompanyNumber(c.number);
                  }}
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500" htmlFor="company-number">Company number</label>
                <CompanyNumberInput
                  id="company-number"
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="e.g. 12345678"
                  value={companyNumber}
                  onChange={setCompanyNumber}
                  name={registeredName}
                  onFound={(c) => {
                    setRegisteredName(c.name);
                    if (!address.trim() && c.address) setAddress(c.address);
                  }}
                />
              </div>
            </div>
          )}

          <AddressFields address={address} onAddress={setAddress} label={personal ? "Your address (optional)" : "Business address"} />
        </div>

        <div className={CARD}>
          <h2 className="font-semibold">VAT</h2>
          <fieldset>
            <legend className="sr-only">VAT</legend>
            <div className="inline-flex rounded-lg border p-0.5">
              {VAT_CHOICES.map((c) => (
                <label key={c.label} className="cursor-pointer">
                  <input type="radio" name="vat" className="peer sr-only accent-neutral-900" checked={vatRegistered === c.on} onChange={() => setVatRegistered(c.on)} />
                  <span className={`block rounded-md px-3 py-1.5 text-sm font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-500 ${vatRegistered === c.on ? "bg-neutral-900 text-white" : "text-neutral-700"}`}>
                    {c.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="text-xs text-neutral-500" htmlFor="vat-number">VAT number</label>
            <input
              id="vat-number"
              className="w-full rounded-lg border px-3 py-2 disabled:bg-neutral-50 disabled:text-neutral-400"
              placeholder="GB123456789"
              value={vatNumber}
              disabled={!vatRegistered}
              onChange={(e) => setVatNumber(e.target.value)}
            />
          </div>
        </div>

        <div className={CARD}>
          <div>
            <h2 className="font-semibold">Invoice numbering</h2>
            <p className="mt-1 text-sm text-neutral-600">
              The next invoice will be <span className="font-medium text-neutral-900">{invoicePrefix}{invoiceNextNumber}</span>.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500" htmlFor="invoice-prefix">Prefix</label>
              <input id="invoice-prefix" className="w-full rounded-lg border px-3 py-2" value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-neutral-500" htmlFor="invoice-next-number">Next number</label>
              <input
                id="invoice-next-number"
                type="number"
                className="w-full rounded-lg border px-3 py-2"
                value={invoiceNextNumber}
                onChange={(e) => setInvoiceNextNumber(e.target.value)}
              />
            </div>
          </div>
          {nextNumberTooLow && (
            <p className="text-xs text-amber-700">
              Your highest existing invoice number is {invoicePrefix}{highestExistingNumber} — setting the next one to{" "}
              {invoicePrefix}{invoiceNextNumber || "0"} would make the series look like it went backwards. Set it to at
              least {invoicePrefix}{highestExistingNumber + 1}, unless that&apos;s deliberate.
            </p>
          )}
        </div>

        <div className={CARD}>
          <div>
            <h2 className="font-semibold">Bank details</h2>
            <p className="mt-1 text-sm text-neutral-600">Printed on every invoice as &quot;How to pay&quot;.</p>
          </div>
          <textarea
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Account name, sort code, account number / IBAN, etc."
            aria-label="Bank details"
            value={bankDetails}
            onChange={(e) => setBankDetails(e.target.value)}
            rows={3}
          />
        </div>

        <div className={CARD}>
          <div>
            <h2 className="font-semibold">Expense categories</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Reorder, rename, add or remove. Removing one leaves the receipts that used it as they are.
            </p>
          </div>

          <div className="space-y-2">
            {categories.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
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

          <div className="flex gap-2 border-t pt-3">
            <input
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
              placeholder="Add a category (e.g. Childcare)"
              aria-label="New category"
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
                onClick={() => setCategories((prev) => withKindCategories(prev, accountKind))}
                className="mt-2 rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700"
              >
                Add them
              </button>
            </div>
          )}
          <button type="button" onClick={() => setCategories(defaultCategoriesFor(accountKind))} className="text-sm text-neutral-500 underline">
            Reset to defaults
          </button>
        </div>

        <div className={CARD}>
          <div>
            <h2 className="font-semibold">Payment reminders</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Up to five reminders go out for an unpaid invoice: 3 days before it&apos;s due, on the day, then 7, 14 and 30
              days after, each a little firmer. They go to clients with reminders switched on under Clients.
            </p>
            <details className="mt-2 text-sm text-neutral-600">
              <summary className="cursor-pointer font-medium text-neutral-700">How it works</summary>
              <p className="mt-2">
                Reminders come from your business name, replies go to your email, and your bank details are added
                underneath. Nothing more is sent after the final notice. Part-paid invoices are chased for what&apos;s still
                owed once their payments are recorded; one marked part-paid with no payments recorded gets none, since its
                balance isn&apos;t known. Edit the wording below; leave a box blank to use the default text. Use{" "}
                <code>{"{{client_name}}"}</code>, <code>{"{{invoice_number}}"}</code>, <code>{"{{amount_due}}"}</code>,{" "}
                <code>{"{{due_date}}"}</code> and <code>{"{{pay_by}}"}</code> (a week from the day it&apos;s sent) anywhere in
                the text.
              </p>
            </details>
          </div>
          {REMINDER_SCHEDULE.map((r) => (
            <div key={r.kind}>
              <label className="text-xs text-neutral-500" htmlFor={`reminder-${r.kind}`}>{r.label}</label>
              <textarea
                id={`reminder-${r.kind}`}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder={DEFAULT_REMINDER_TEXT[r.kind]}
                value={reminderTexts[r.kind]}
                onChange={(e) => setReminderTexts((prev) => ({ ...prev, [r.kind]: e.target.value }))}
                rows={2}
              />
            </div>
          ))}
          <label className="flex items-start gap-2 border-t pt-3 text-sm">
            <input className="mt-1 accent-neutral-900" type="checkbox" checked={latePaymentInterest} onChange={(e) => setLatePaymentInterest(e.target.checked)} />
            <span>
              In the final notice to a business client, say you can claim late-payment interest
              <span className="block text-xs text-neutral-500">
                Under the Late Payment of Commercial Debts (Interest) Act 1998 a business can claim 8% a year above
                the Bank of England base rate, plus £40, £70 or £100 compensation depending on the amount. It
                doesn&apos;t apply to private individuals: only clients marked Company get it, so check private
                customers are marked Individual under Clients. Leave this off if your own terms set a late-payment
                interest rate, since that replaces the statutory one.
              </span>
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input className="accent-neutral-900" type="checkbox" checked={showOverdueReminders} onChange={(e) => setShowOverdueReminders(e.target.checked)} />
            Gently remind me on the dashboard about overdue invoices
          </label>
        </div>

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
              {!dirty && saved && !migrationPending && <span className="text-sm text-green-700">Saved.</span>}
            </div>
          )}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <p role="status" className="sr-only">{saved && !migrationPending ? "Saved." : ""}</p>
          {saved && migrationPending && (
            <p className="text-sm text-amber-700">
              Saved, apart from what you&apos;re using the app for and the registered company details: this database hasn&apos;t
              had migration-029 run against it yet. Everything else is in.
            </p>
          )}
        </div>
      </form>

      <div className={CARD}>
        <div>
          <h2 className="font-semibold">Notifications</h2>
          <p className="mt-1 text-sm text-neutral-600">
            A push notification, even when the app isn&apos;t open, when an invoice is overdue, a bill or recurring expense
            is due, a customer opens or answers a quote or opens an invoice, or a supplier sends prices.
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
            {pushError && <p role="alert" className="text-sm text-red-600">{pushError}</p>}
            <button type="button" onClick={togglePush} disabled={pushBusy} className={SMALL_BUTTON}>
              {pushBusy ? "Working…" : pushEnabled ? "Turn off notifications" : "Turn on notifications"}
            </button>
          </>
        )}
      </div>

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
              account — don&apos;t post it publicly, and regenerate it below if it ever ends up somewhere it
              shouldn&apos;t.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg border bg-neutral-50 px-3 py-2 text-sm">
                {inboxRevealed ? inboxAddress(inboxToken) : `u-${"•".repeat(32)}@invoiceover.com`}
              </code>
              <button type="button" onClick={() => setInboxRevealed((v) => !v)} className="rounded-lg border px-3 py-2 text-sm font-medium text-neutral-700">
                {inboxRevealed ? "Hide" : "Reveal"}
              </button>
              <button type="button" onClick={copyInboxAddress} className="rounded-lg border px-3 py-2 text-sm font-medium text-neutral-700">
                {inboxCopied ? "Copied" : "Copy"}
              </button>
            </div>
            <button type="button" onClick={regenerateInboxToken} disabled={inboxBusy} className={SMALL_BUTTON}>
              {inboxBusy ? "Working…" : "Regenerate address"}
            </button>
            <p className="text-xs text-neutral-500">
              Regenerating immediately stops the old address from working — use this if it ever ends up somewhere
              you didn&apos;t intend.
            </p>
          </>
        ) : (
          <button type="button" onClick={regenerateInboxToken} disabled={inboxBusy} className={SMALL_BUTTON}>
            {inboxBusy ? "Generating…" : "Get my import address"}
          </button>
        )}
      </div>

      <div className={CARD}>
        <div>
          <h2 className="font-semibold">Your account</h2>
          <p className="mt-1 text-sm text-neutral-600">
            You&apos;re signed in as <span className="font-medium text-neutral-900">{user?.email ?? "—"}</span>. That address
            is the one reminders and invoice emails come back to when a customer replies.
          </p>
        </div>

        <div className="border-t pt-3">
          <p className="text-xs text-neutral-500">Getting back in</p>
          <p className="mt-1 text-sm text-neutral-600">
            Signed out, or forgotten the password? Ask for a link by email — it opens the app already signed in and lets
            you set a new password. From the sign-in screen it&apos;s the same thing: <strong>Forgotten your password?</strong>
          </p>
          <button type="button" onClick={emailSignInLink} disabled={signInBusy || !user?.email} className={`mt-2 ${SMALL_BUTTON}`}>
            {signInBusy ? "Sending…" : "Email me a sign-in link"}
          </button>
          {signInNote && <p className="mt-2 text-sm text-neutral-600">{signInNote}</p>}
        </div>

        <div className="border-t pt-3">
          <p className="text-xs text-neutral-500">Where your data lives</p>
          <p className="mt-1 text-sm text-neutral-600">
            In a Postgres database run by Supabase in the EU (Ireland), locked to your account: every table is read and
            written only by the signed-in owner. Scanned photos and PDFs sit in a private bucket and are handed out as
            links that expire after seven days. Invoice and quote links you share are the one exception — anyone holding
            that address sees that one document, until you stop the link from its page.
          </p>
        </div>

        <div className="border-t pt-3">
          <p className="text-xs text-neutral-500">Take it all with you</p>
          <p className="mt-1 text-sm text-neutral-600">
            Download everything you&apos;ve stored — clients, receipts, invoices, payments, credit notes, quotes, recurring
            expenses and feedback — as one JSON file, with the scanned images and PDFs inside it. Invoices, receipts and
            clients also export as CSV from their own pages, for a spreadsheet or an accountant.
          </p>
          {exportError && <p role="alert" className="mt-2 text-sm text-red-600">{exportError}</p>}
          <button type="button" onClick={exportData} disabled={exporting} className={`mt-2 ${SMALL_BUTTON}`}>
            {exporting ? "Preparing your download…" : "Download all my data"}
          </button>
        </div>

        <div className="border-t pt-3">
          <p className="text-xs text-neutral-500">Closing the account</p>
          <p className="mt-1 text-sm text-neutral-600">
            There&apos;s no delete button anywhere in this app, on purpose: an accounting record you&apos;ve thrown away by
            accident can&apos;t be got back, and HMRC expects you to keep it for six years. To have the account and
            everything in it removed, ask through <a href="/feedback" className="underline">Feedback</a> and it&apos;s done
            by hand, once, after you&apos;ve exported what you want to keep.
          </p>
        </div>

        <button type="button" onClick={() => void signOut()} className={SMALL_BUTTON}>
          Sign out
        </button>
      </div>
    </div>
  );
}
