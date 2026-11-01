"use client";

import Link from "next/link";
import Tip from "@/components/Tip";
import { safePaymentLink } from "@/lib/paymentLink";
import { DEFAULT_REMINDER_TEXT, REMINDER_SCHEDULE } from "@/lib/reminderTemplates";
import { CARD, FormState, SaveBar, SettingsHeader, useProfileForm, type FormKey } from "@/components/settings/ProfileForm";

const KEYS: FormKey[] = ["invoicePrefix", "invoiceNextNumber", "bankDetails", "paymentLink", "reminderTexts", "latePaymentInterest", "showOverdueReminders"];

export default function InvoiceSettingsPage() {
  const form = useProfileForm(KEYS, { invoices: true });
  const { values, set } = form;

  if (!values || form.loadError) {
    return (
      <div className="space-y-6">
        <SettingsHeader title="Invoices and payments" />
        <FormState form={form} />
      </div>
    );
  }

  // Personal use sends no invoices; these were hidden from it on the one
  // long page too.
  if (values.accountKind === "personal") {
    return (
      <div className="space-y-6">
        <SettingsHeader title="Invoices and payments">
          <p className="mt-1 text-neutral-600">
            These are for a business. You&apos;re set up for personal use: change that under{" "}
            <Link href="/settings/business" className="underline">Business</Link> if you send invoices.
          </p>
        </SettingsHeader>
      </div>
    );
  }

  const { invoicePrefix, invoiceNextNumber, bankDetails, paymentLink, reminderTexts, latePaymentInterest, showOverdueReminders } = values;
  const highestExistingNumber = form.highestExistingNumber;
  const nextNumberTooLow = (parseInt(invoiceNextNumber, 10) || 0) <= highestExistingNumber && highestExistingNumber > 0;

  return (
    <div className="space-y-6">
      <SettingsHeader title="Invoices and payments">
        <Tip id="settings-invoices">How it works: the next number is used when an invoice is sent, never for a draft. Your bank details and Pay now link print on every invoice, and the reminders go out by themselves to customers who have them switched on.</Tip>
        <p className="mt-1 text-neutral-600">Your invoice numbers, how customers pay you, and the reminders that chase them.</p>
      </SettingsHeader>

      <form onSubmit={form.save} className="space-y-6">
        <div className={CARD}>
          <div>
            <h2 className="font-semibold">Invoice numbering</h2>
            <p className="mt-1 text-sm text-neutral-600">
              The next invoice will be <span className="wrap-anywhere font-medium text-neutral-900">{invoicePrefix}{invoiceNextNumber}</span>.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500" htmlFor="invoice-prefix">Prefix</label>
              <input id="invoice-prefix" autoCapitalize="characters" autoCorrect="off" spellCheck={false} className="w-full rounded-lg border px-3 py-2" value={invoicePrefix} onChange={(e) => set("invoicePrefix", e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-neutral-500" htmlFor="invoice-next-number">Next number</label>
              <input
                id="invoice-next-number"
                type="number"
                className="w-full rounded-lg border px-3 py-2"
                value={invoiceNextNumber}
                onChange={(e) => set("invoiceNextNumber", e.target.value)}
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
            onChange={(e) => set("bankDetails", e.target.value)}
            rows={3}
          />
          <div>
            <label htmlFor="payment-link" className="text-xs text-neutral-500">Your payment link (optional)</label>
            <input
              id="payment-link"
              type="url"
              inputMode="url"
              autoComplete="off"
              className="w-full rounded-lg border px-3 py-2"
              placeholder="https://pay.sumup.com/... or paypal.me/..."
              value={paymentLink}
              onChange={(e) => set("paymentLink", e.target.value)}
              aria-describedby="payment-link-help"
            />
            <p id="payment-link-help" className="mt-1 text-xs text-neutral-500">
              {paymentLink.trim() && !safePaymentLink(paymentLink)
                ? "That doesn't look like a web address starting https://, so it won't be shown."
                : "Paste a link from SumUp, Stripe, PayPal, Monzo or Starling and your invoices get a Pay now button. The money goes straight to you."}
            </p>
          </div>
        </div>

        <div className={CARD}>
          <div>
            <h2 className="font-semibold">Payment reminders</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Up to five reminders go out for an unpaid invoice: 3 days before it&apos;s due, on the day, then 7, 14 and 30
              days after, each a little firmer. They go to customers with reminders switched on under Customers &amp;
              suppliers.
            </p>
            <details className="mt-2 text-sm text-neutral-600">
              <summary className="cursor-pointer font-medium text-neutral-700">How it works</summary>
              <p className="mt-2">
                Reminders come from your business name, replies go to your email, and your bank details are added
                underneath. Nothing more is sent after the final notice. Part-paid invoices are chased for what&apos;s still
                owed once their payments are recorded; one marked part-paid with no payments recorded gets none, since its
                balance isn&apos;t known. Edit the wording below; leave a box blank to use the default text. Use{" "}
                {/* Not renamed to customer_name with the rest of the wording:
                    it is a token people have already typed into their saved
                    reminder text, and changing it would silently stop those
                    substituting. */}
                {/* wrap-anywhere: these are single unbreakable words and at a
                    large text size one of them is wider than a narrow phone. */}
                <code className="wrap-anywhere">{"{{client_name}}"}</code>, <code className="wrap-anywhere">{"{{invoice_number}}"}</code>,{" "}
                <code className="wrap-anywhere">{"{{amount_due}}"}</code>, <code className="wrap-anywhere">{"{{due_date}}"}</code> and{" "}
                <code className="wrap-anywhere">{"{{pay_by}}"}</code> (a week from the day it&apos;s sent) anywhere in
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
                onChange={(e) => set("reminderTexts", (prev) => ({ ...prev, [r.kind]: e.target.value }))}
                rows={2}
              />
            </div>
          ))}
          <label className="flex items-start gap-2 border-t pt-3 text-sm">
            <input className="mt-1 accent-neutral-900" type="checkbox" checked={latePaymentInterest} onChange={(e) => set("latePaymentInterest", e.target.checked)} />
            <span>
              Tell business customers you can claim late-payment interest
              <span className="block text-xs text-neutral-500">
                Under the Late Payment of Commercial Debts (Interest) Act 1998 a business can claim 8% a year above
                the Bank of England base rate, plus £40, £70 or £100 compensation depending on the amount. With this
                on, a line saying so prints at the foot of an invoice to a business customer, and the final reminder
                says it too &mdash; on the invoice is where it does the work, since that is what somebody reads when
                deciding which invoice to pay this week. It doesn&apos;t apply to private individuals: only customers
                marked Company get it, so check private customers are marked Individual under Customers &amp;
                suppliers. Leave this off if your own terms set a late-payment interest rate, since that replaces
                the statutory one.
              </span>
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input className="accent-neutral-900" type="checkbox" checked={showOverdueReminders} onChange={(e) => set("showOverdueReminders", e.target.checked)} />
            Gently remind me on the dashboard about overdue invoices
          </label>
        </div>

        <SaveBar form={form} pending={["your payment link", "that needs"]} />
      </form>
    </div>
  );
}
