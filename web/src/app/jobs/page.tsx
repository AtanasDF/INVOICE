"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CreditNote,
  Invoice,
  InvoicePayment,
  Receipt,
  businessProfileStore,
  creditNotesStore,
  invoicesStore,
  paymentsStore,
  receiptsStore,
} from "@/lib/storage";
import { jobs as buildJobs } from "@/lib/jobs";
import { money } from "@/lib/money";
import { shortDate } from "@/lib/dates";
import { loadFailed } from "@/lib/errorText";
import Tip from "@/components/Tip";

export default function JobsPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [vatRegistered, setVatRegistered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([invoicesStore.all(), receiptsStore.all(), creditNotesStore.all(), paymentsStore.all(), businessProfileStore.get()])
      .then(([inv, rec, notes, pays, profile]) => {
        setInvoices(inv);
        setReceipts(rec);
        setCreditNotes(notes);
        setPayments(pays);
        setVatRegistered(profile.vatRegistered);
      })
      .catch((err) => setError(loadFailed(err, "your jobs")))
      .finally(() => setLoading(false));
  }, []);

  const list = useMemo(
    () => buildJobs(invoices, receipts, creditNotes, payments, vatRegistered),
    [invoices, receipts, creditNotes, payments, vatRegistered]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Jobs</h1>
        <p className="mt-1 text-neutral-600">One piece of work, with what it brought in and what it cost.</p>
      </div>
      <Tip id="jobs-how">
        How it works: put the same tag on an invoice and on the receipts for that work &mdash; &ldquo;Willow Road&rdquo;, say &mdash; and
        they gather here. You can start a job after the fact: tag things whenever you like and this page catches up.
      </Tip>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading&hellip;</p>
      ) : list.length === 0 && !error ? (
        <p className="text-sm text-neutral-500">
          No jobs yet. Tag an invoice and the receipts that went with it using the same words, and the job appears here.
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((j) => (
            <li key={j.name} className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-semibold wrap-anywhere">{j.name}</h2>
                  <p className="text-xs text-neutral-500">
                    {j.invoices.length} invoice{j.invoices.length === 1 ? "" : "s"} &middot; {j.receipts.length} receipt
                    {j.receipts.length === 1 ? "" : "s"}
                    {j.lastActivity ? ` · last ${shortDate(j.lastActivity)}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(open === j.name ? null : j.name)}
                  aria-expanded={open === j.name}
                  className="inline-block py-1 text-sm font-medium text-neutral-700 underline"
                >
                  {open === j.name ? "Hide" : "What is in it"}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  { label: "Invoiced", value: j.invoiced, note: j.owed > 0 ? `${money(j.owed)} still owed` : "" },
                  { label: "Spent", value: j.spent, note: "" },
                  { label: "Left over", value: j.left, note: "" },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-xs text-neutral-500 wrap-anywhere">{s.label}</p>
                    <p className="text-base font-semibold wrap-anywhere">{money(s.value)}</p>
                    {s.note && <p className="text-xs text-neutral-500 wrap-anywhere">{s.note}</p>}
                  </div>
                ))}
              </div>

              {open === j.name && (
                <div className="mt-4 space-y-3 border-t pt-3">
                  <div>
                    <p className="text-xs text-neutral-500">Invoiced</p>
                    {j.invoices.length === 0 ? (
                      <p className="text-sm text-neutral-500">Nothing invoiced on this job yet.</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {j.invoices.map((inv) => (
                          <li key={inv.id} className="text-sm">
                            <Link href={`/invoices/${inv.id}`} className="font-medium text-neutral-700 underline wrap-anywhere">
                              {inv.number || "Draft"}
                            </Link>
                            <span className="text-neutral-500"> &middot; {shortDate(inv.date)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Spent</p>
                    {j.receipts.length === 0 ? (
                      <p className="text-sm text-neutral-500">Nothing tagged as a cost on this job yet.</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {j.receipts.map((r) => (
                          <li key={r.id} className="text-sm wrap-anywhere">
                            <Link href={`/receipts?open=${r.id}`} className="font-medium text-neutral-700 underline">
                              {r.vendor || "Receipt"}
                            </Link>
                            <span className="text-neutral-500">
                              {" "}&middot; {shortDate(r.date)} &middot; {money(r.amount + r.vatAmount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
