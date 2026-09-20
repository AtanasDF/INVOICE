"use client";

import Link from "next/link";
import { money } from "@/lib/money";
import { useEffect, useState } from "react";
import { CreditNote, Invoice, InvoicePayment, Receipt, businessProfileStore, creditNotesStore, invoicesStore, paymentsStore, receiptsStore } from "@/lib/storage";
import { VatBasis, previousQuarter, quarterLabel, quarterOf, vatFigures } from "@/lib/vatReturn";
import { shortDate } from "@/lib/quoteStatus";
import { loadFailed } from "@/lib/errorText";
import { todayISO } from "@/lib/today";

const INPUT = "w-full rounded-lg border px-3 py-2 text-base sm:text-sm";

const todayIso = () => todayISO();

// The figures for a VAT return, from what's already in the app: something to
// check and copy into HMRC's form. Nothing is filed from here.
export default function VatPage() {
  const [data, setData] = useState<{ invoices: Invoice[]; credits: CreditNote[]; payments: InvoicePayment[]; receipts: Receipt[]; vatRegistered: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const last = previousQuarter(todayIso());
  const [from, setFrom] = useState(last.from);
  const [to, setTo] = useState(last.to);
  const [basis, setBasis] = useState<VatBasis>("invoice");
  const [showLines, setShowLines] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([invoicesStore.all(), creditNotesStore.all(), paymentsStore.all(), receiptsStore.all(), businessProfileStore.get()])
      .then(([invoices, credits, payments, receipts, profile]) => setData({ invoices, credits, payments, receipts, vatRegistered: profile.vatRegistered }))
      .catch((err) => setError(loadFailed(err, "your figures")));
  }, []);

  const f = data ? vatFigures(data.invoices, data.credits, data.payments, data.receipts, data.vatRegistered, { from, to }, basis) : null;
  const boxes = f
    ? [
        { n: 1, label: "VAT due on sales", value: f.box1 },
        { n: 4, label: "VAT you can reclaim on purchases", value: f.box4 },
        { n: 5, label: f.box5 >= 0 ? "VAT to pay HMRC" : "VAT HMRC owes you", value: Math.abs(f.box5), strong: true },
        { n: 6, label: "Total sales, ex VAT", value: f.box6 },
        { n: 7, label: "Total purchases, ex VAT", value: f.box7 },
      ]
    : [];

  async function copy() {
    if (!f) return;
    await navigator.clipboard
      .writeText(
        [
          `VAT figures ${quarterLabel(from, to)} (${basis === "invoice" ? "invoice date" : "cash accounting"})`,
          `Box 1 VAT due on sales: ${money(f.box1)}`,
          `Box 4 VAT reclaimed on purchases: ${money(f.box4)}`,
          `Box 5 ${f.box5 >= 0 ? "to pay" : "to reclaim"}: ${money(Math.abs(f.box5))}`,
          `Box 6 sales ex VAT: ${money(f.box6)}`,
          `Box 7 purchases ex VAT: ${money(f.box7)}`,
        ].join("\n")
      )
      .catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/expenses" className="text-sm text-neutral-500">← Expenses</Link>
        <h1 className="mt-1 text-2xl font-bold">VAT</h1>
        <p className="mt-1 text-neutral-600">The figures for a quarter, worked out from your invoices and receipts. Check them, then copy them into HMRC&apos;s form.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {data && !data.vatRegistered && (
        <p className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
          Settings says you&apos;re not VAT registered, so your invoices carry no VAT. The purchases below still show the VAT you were charged.
        </p>
      )}

      <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Last quarter", range: previousQuarter(todayIso()) },
            { label: "This quarter", range: quarterOf(todayIso()) },
          ].map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => {
                setFrom(q.range.from);
                setTo(q.range.to);
              }}
              aria-pressed={from === q.range.from && to === q.range.to}
              className={`rounded-full px-3 py-1 text-xs font-medium ${from === q.range.from && to === q.range.to ? "bg-neutral-900 text-white" : "border text-neutral-700"}`}
            >
              {q.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-neutral-500" htmlFor="v-from">From</label>
            <input id="v-from" type="date" className={INPUT} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-500" htmlFor="v-to">To</label>
            <input id="v-to" type="date" className={INPUT} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div role="radiogroup" aria-label="How VAT is counted" className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1">
          {([
            { id: "invoice" as const, label: "By invoice date" },
            { id: "cash" as const, label: "When money moved" },
          ]).map((b) => (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={basis === b.id}
              onClick={() => setBasis(b.id)}
              className={`rounded-md py-1.5 text-sm font-medium ${basis === b.id ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}
            >
              {b.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-neutral-500">
          {basis === "invoice"
            ? "Standard VAT accounting: sales count when the invoice is dated, whether or not it's been paid."
            : "Cash accounting: sales count when the money came in. Purchases are counted by the date on the receipt either way, so check anything you haven't paid for yet."}
        </p>
      </div>

      {f && (
        <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">{quarterLabel(from, to)}</h2>
            <button type="button" onClick={copy} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700">
              {copied ? "Copied" : "Copy the figures"}
            </button>
          </div>
          <dl className="mt-3 divide-y text-sm">
            {boxes.map((b) => (
              <div key={b.n} className={`flex items-baseline justify-between gap-3 py-2 ${b.strong ? "font-semibold" : ""}`}>
                <dt>
                  <span className="text-neutral-500">Box {b.n}</span> {b.label}
                </dt>
                <dd>{money(b.value)}</dd>
              </div>
            ))}
          </dl>
          <button type="button" onClick={() => setShowLines((v) => !v)} className="mt-3 text-sm font-medium text-blue-600">
            {showLines ? "Hide what's in it" : "What's in it"}
          </button>
          {showLines && (
            <div className="mt-3 space-y-4 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Sales ({f.sales.length})</p>
                <ul className="mt-1 divide-y">
                  {f.sales.map((s) => (
                    <li key={s.id} className="flex items-baseline justify-between gap-3 py-1.5">
                      <span className="min-w-0 truncate">
                        {s.number} <span className="text-xs text-neutral-500">{shortDate(s.date)}</span>
                      </span>
                      <span className="shrink-0">
                        {money(s.net)} <span className="text-xs text-neutral-500">+ {money(s.vat)} VAT</span>
                      </span>
                    </li>
                  ))}
                  {!f.sales.length && <li className="py-1.5 text-neutral-600">Nothing in this period.</li>}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Purchases ({f.purchases.length})</p>
                <ul className="mt-1 divide-y">
                  {f.purchases.map((p) => (
                    <li key={p.id} className="flex items-baseline justify-between gap-3 py-1.5">
                      <span className="min-w-0 truncate">
                        {p.vendor} <span className="text-xs text-neutral-500">{shortDate(p.date)}</span>
                      </span>
                      <span className="shrink-0">
                        {money(p.net)} <span className="text-xs text-neutral-500">+ {money(p.vat)} VAT</span>
                      </span>
                    </li>
                  ))}
                  {!f.purchases.length && <li className="py-1.5 text-neutral-600">Nothing in this period.</li>}
                </ul>
              </div>
            </div>
          )}
          {f.creditsHeldBack > 0 && (
            <p className="mt-3 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
              {f.creditsHeldBack === 1 ? "One credit note is" : `${f.creditsHeldBack} credit notes are`} counted only in part here, or not at
              all: on cash accounting a sale is declared when the money arrives, so cancelling an invoice that was never paid has no VAT to take
              back. On the invoice basis {f.creditsHeldBack === 1 ? "it comes" : "they come"} off in full.
            </p>
          )}
          <p className="mt-3 text-xs text-neutral-500">
            A summary to check, not a filing: nothing here is sent to HMRC. Documents still waiting to be reviewed are left out, and anything on a
            margin or reverse-charge scheme needs checking by hand. On cash accounting, a CIS deduction counts as money received — the contractor
            pays that part to HMRC on your behalf — so a CIS invoice counts in full once its balance is settled.
          </p>
        </div>
      )}
    </div>
  );
}
