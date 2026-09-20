"use client";

import { useEffect, useState } from "react";
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
import { CATEGORIES, effectiveCategories } from "@/lib/categories";
import { downloadJson } from "@/lib/exportJson";
import { disablePush, enablePush, getExistingSubscription, isIosNotStandalone, pushSupported, subscriptionToRecord } from "@/lib/push";
import { signOut } from "@/lib/signOut";
import { generateInboxToken, inboxAddress } from "@/lib/inboxToken";
import { DEFAULT_REMINDER_TEXT, REMINDER_SCHEDULE, ReminderKind } from "@/lib/reminderTemplates";
import { parseSequenceNumber } from "@/lib/invoiceNumber";
import { inlineImage } from "@/lib/receiptImages";
import CompanyNameInput from "@/components/CompanyNameInput";
import AddressFields from "@/components/AddressFields";
import { useAuth } from "@/lib/authContext";
import { supabase } from "@/lib/supabaseClient";
import { loadFailed, saveFailed } from "@/lib/errorText";
import { todayISO } from "@/lib/today";

// A limited company must show its registered name and number on its
// invoices (Companies Act 2006 s.82); a sole trader has neither, and
// personal use has no business at all. Nothing else follows from this
// yet -- see notes/future-ideas.md.
const ACCOUNT_KINDS: { value: AccountKind; label: string; hint: string }[] = [
  { value: "limited", label: "A limited company", hint: "Registered at Companies House" },
  { value: "sole_trader", label: "A sole trader", hint: "Self-employed, working under your own name or a trading name" },
  { value: "personal", label: "Personal use", hint: "Keeping track of your own spending" },
];

export default function SettingsPage() {
  const { user } = useAuth();
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

  useEffect(() => {
    Promise.all([businessProfileStore.get(), invoicesStore.all()]).then(([p, invoices]) => {
      setBusinessName(p.businessName);
      setRegisteredName(p.registeredName);
      setCompanyNumber(p.companyNumber);
      setAccountKind(p.accountKind);
      setVatNumber(p.vatNumber);
      setAddress(p.address);
      setShowOverdueReminders(p.showOverdueReminders);
      setCategories(effectiveCategories(p.customCategories));
      setInboxToken(p.inboxToken);
      setInvoicePrefix(p.invoicePrefix);
      setInvoiceNextNumber(String(p.invoiceNextNumber));
      setLoadedNextNumber(p.invoiceNextNumber);
      setVatRegistered(p.vatRegistered);
      setBankDetails(p.bankDetails);
      setReminderTexts({
        before: p.reminderTextBefore ?? "",
        due: p.reminderTextDue ?? "",
        after: p.reminderTextAfter ?? "",
        late: p.reminderTextLate ?? "",
        final: p.reminderTextFinal ?? "",
      });
      setLatePaymentInterest(p.reminderLatePaymentInterest);
      const sequenceNumbers = invoices
        .map((inv) => parseSequenceNumber(inv.number, p.invoicePrefix))
        .filter((n): n is number => n !== null);
      setHighestExistingNumber(sequenceNumbers.length ? Math.max(...sequenceNumbers) : 0);
    })
      .catch((err) => setError(loadFailed(err, "your settings")))
      .finally(() => setLoading(false));
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
        reminderTextFinal: reminderTexts.final.trim() || null,
        reminderLatePaymentInterest: latePaymentInterest,
      });
      setMigrationPending(!full);
      setLoadedNextNumber(nextNumber);
      setInvoiceNextNumber(String(nextNumber));
      setSaved(true);
    } catch (err) {
      setError(saveFailed(err, "Could not save your profile."));
    } finally {
      setSaving(false);
    }
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
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  const nextNumberTooLow = (parseInt(invoiceNextNumber, 10) || 0) <= highestExistingNumber && highestExistingNumber > 0;
  // Registered details stay on screen once they're filled in, whatever the
  // kind says, so changing your mind can't hide what's printed.
  const limited = accountKind === "limited" || !!registeredName || !!companyNumber;
  const personal = accountKind === "personal";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-neutral-600">
          Your business details fill in automatically on every invoice you create. Your account and your data are here too.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
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
          <button
            type="button"
            onClick={emailSignInLink}
            disabled={signInBusy || !user?.email}
            className="mt-2 rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50"
          >
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
          {exportError && <p className="mt-2 text-sm text-red-600">{exportError}</p>}
          <button
            type="button"
            onClick={exportData}
            disabled={exporting}
            className="mt-2 rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50"
          >
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

        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700"
        >
          Sign out
        </button>
      </div>

      <form onSubmit={save} className="space-y-6">
        <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <div>
            <h2 className="font-semibold">Your business</h2>
            <p className="mt-1 text-sm text-neutral-600">Fill this in once and it goes on every invoice, quote and reminder.</p>
          </div>

          <fieldset>
            <legend className="text-xs text-neutral-500">What are you using this for?</legend>
            <div className="mt-1 space-y-1">
              {ACCOUNT_KINDS.map((k) => (
                <label key={k.value} className="flex items-start gap-2 text-sm">
                  <input
                    className="mt-1"
                    type="radio"
                    name="account-kind"
                    checked={accountKind === k.value}
                    onChange={() => setAccountKind(k.value)}
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
            <label className="text-xs text-neutral-500">{personal ? "Your name" : "Business name"}</label>
            <CompanyNameInput
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
                ? "The name customers know you by — the headline on every document. If it isn't the name on the register, fill that in below as well."
                : "The name customers know you by — the headline on every document."}
            </p>
          </div>

          {limited && (
            <div className="space-y-3 rounded-lg border bg-neutral-50 p-3">
              <p className="text-sm text-neutral-600">
                A limited company must show its registered name and company number on its invoices (Companies Act 2006).
                Fill both in and they print small at the foot of the invoice, leaving your trading name as the headline.
              </p>
              <div>
                <label className="text-xs text-neutral-500">Registered company name</label>
                <CompanyNameInput
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
                <label className="text-xs text-neutral-500">Company number</label>
                <input
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="e.g. 12345678"
                  value={companyNumber}
                  onChange={(e) => setCompanyNumber(e.target.value)}
                />
              </div>
            </div>
          )}

          <AddressFields address={address} onAddress={setAddress} label={personal ? "Your address (optional)" : "Business address (optional)"} />
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
            <h2 className="font-semibold">VAT</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Off by default. When off, invoices show no VAT block at all and your VAT number is never printed,
              even if it&apos;s filled in below — so deregistering doesn&apos;t mean you have to go blank that field too.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={vatRegistered} onChange={(e) => setVatRegistered(e.target.checked)} />
            VAT registered
          </label>
          <div>
            <label className="text-xs text-neutral-500">VAT number</label>
            <input
              className="w-full rounded-lg border px-3 py-2"
              value={vatNumber}
              onChange={(e) => setVatNumber(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <div>
            <h2 className="font-semibold">Invoice numbering</h2>
            <p className="mt-1 text-sm text-neutral-600">
              The next invoice you mark as sent is assigned {invoicePrefix}{invoiceNextNumber} automatically — there&apos;s
              no way to override that per invoice any more, so this is the only place that controls the sequence.
              It advances by one every time an invoice is actually sent.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500">Prefix</label>
              <input className="w-full rounded-lg border px-3 py-2" value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Next number</label>
              <input
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

        <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <div>
            <h2 className="font-semibold">Bank details</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Shown as a dedicated &quot;How to pay&quot; block on printed invoices, instead of buried in the notes.
            </p>
          </div>
          <textarea
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Account name, sort code, account number / IBAN, etc."
            value={bankDetails}
            onChange={(e) => setBankDetails(e.target.value)}
            rows={3}
          />
        </div>

        <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <div>
            <h2 className="font-semibold">Payment reminders</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Up to five reminders go out per unpaid invoice, each a little firmer: 3 days before it&apos;s due, on
              the due date, then 7, 14 and 30 days after. They go to any client with reminders turned on (see their
              entry under Clients), come from your business name, replies go to your email, and your bank details
              are added underneath. Nothing more is sent after the final notice. Part-paid invoices are chased for
              what&apos;s still owed once their payments are recorded; one marked part-paid with no payments recorded
              gets none, since its balance isn&apos;t known. Edit the wording below; leave a box blank to use
              the default text. Use <code>{"{{client_name}}"}</code>, <code>{"{{invoice_number}}"}</code>,{" "}
              <code>{"{{amount_due}}"}</code>, <code>{"{{due_date}}"}</code> and <code>{"{{pay_by}}"}</code> (a week
              from the day it&apos;s sent) anywhere in the text.
            </p>
          </div>
          {REMINDER_SCHEDULE.map((r) => (
            <div key={r.kind}>
              <label className="text-xs text-neutral-500">{r.label}</label>
              <textarea
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder={DEFAULT_REMINDER_TEXT[r.kind]}
                value={reminderTexts[r.kind]}
                onChange={(e) => setReminderTexts((prev) => ({ ...prev, [r.kind]: e.target.value }))}
                rows={2}
              />
            </div>
          ))}
          <label className="flex items-start gap-2 border-t pt-3 text-sm">
            <input className="mt-1" type="checkbox" checked={latePaymentInterest} onChange={(e) => setLatePaymentInterest(e.target.checked)} />
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
        {saved && !migrationPending && <p className="text-sm text-green-700">Saved.</p>}
        {saved && migrationPending && (
          <p className="text-sm text-amber-700">
            Saved, apart from what you&apos;re using the app for and the registered company details: this database hasn&apos;t
            had migration-029 run against it yet. Everything else is in.
          </p>
        )}
        <button disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      </form>

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
