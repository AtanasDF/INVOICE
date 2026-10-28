"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Client,
  CreditNote,
  Invoice,
  InvoicePayment,
  Receipt,
  businessProfileStore,
  clientsStore,
  creditNotesStore,
  invoicesStore,
  paymentsStore,
  receiptsStore,
} from "@/lib/storage";
import { moneyScreen, type Owed } from "@/lib/moneyScreen";
import { money } from "@/lib/money";
import { shortDate } from "@/lib/dates";
import { todayISO } from "@/lib/today";
import { loadFailed, saveFailed } from "@/lib/errorText";
import Tip from "@/components/Tip";
import TaxSoFar from "@/components/TaxSoFar";
import { estimateTax } from "@/lib/taxEstimate";

// How late what is owed to you is, in the four bands an accountant would ask
// about. It was a card of its own on Home until 2026-10-28.
const LATENESS = [
  { label: "Not yet due", test: (d: number) => d <= 0 },
  { label: "1 to 30 days late", test: (d: number) => d >= 1 && d <= 30 },
  { label: "31 to 60 days late", test: (d: number) => d >= 31 && d <= 60 },
  { label: "61 to 90 days late", test: (d: number) => d >= 61 && d <= 90 },
  { label: "Over 90 days late", test: (d: number) => d >= 91 },
];

const WHEN: Record<Owed["when"], { label: string; className: string }> = {
  late: { label: "Late", className: "bg-red-100 text-red-800" },
  soon: { label: "This week", className: "bg-amber-100 text-amber-800" },
  later: { label: "Later", className: "bg-neutral-100 text-neutral-700" },
  undated: { label: "No date", className: "bg-neutral-100 text-neutral-700" },
};

export default function MoneyPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [vatRegistered, setVatRegistered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Kept apart from the action's error: one state served both, so a failed
  // "Mark paid" hid every figure that had loaded until the page was reloaded.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const today = todayISO();
  // Marking a bill paid writes to the record; `disabled` lands a render too
  // late to stop a second press.
  const paying = useRef(false);

  useEffect(() => {
    Promise.all([invoicesStore.all(), receiptsStore.all(), clientsStore.all(), creditNotesStore.all(), paymentsStore.all(), businessProfileStore.get()])
      .then(([inv, rec, cli, notes, pays, profile]) => {
        setInvoices(inv);
        setReceipts(rec);
        setClients(cli);
        setCreditNotes(notes);
        setPayments(pays);
        setVatRegistered(profile.vatRegistered);
      })
      .catch((err) => setLoadError(loadFailed(err, "your money")))
      .finally(() => setLoading(false));
  }, []);

  const nameOf = useMemo(() => {
    const byId = new Map(clients.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? byId.get(id) ?? "" : "");
  }, [clients]);

  const m = useMemo(
    () => moneyScreen(invoices, creditNotes, payments, receipts, nameOf, vatRegistered, today),
    [invoices, creditNotes, payments, receipts, nameOf, vatRegistered, today]
  );

  const tax = useMemo(() => estimateTax({ invoices, creditNotes, receipts, vatRegistered, today }), [invoices, creditNotes, receipts, vatRegistered, today]);
  const lateness = useMemo(
    () => LATENESS.map((b) => ({ label: b.label, total: m.owedToYou.filter((o) => b.test(o.daysLate)).reduce((t, o) => t + o.amount, 0) })),
    [m]
  );

  // Home's figures link to #you-owe and #tax, which do not exist until the
  // records have loaded -- by which time the browser has given up looking.
  useEffect(() => {
    if (!loading && window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [loading]);

  // Marking several at once (Atanas, 2026-09-24: "it should let you mark a
  // few of them... pay this company only, pay that company only"). Money
  // usually arrives in a lump: one customer settles three invoices with a
  // single transfer. Each is a payment of whatever is still owed on it -- the
  // same thing "Mark as paid" does on the invoice itself. Nothing is marked
  // until the button is pressed, and a failure says which one and leaves the
  // rest. Moved here from Home on 2026-10-28.
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [settling, setSettling] = useState(false);
  const settlingRef = useRef(false);

  async function markPickedPaid() {
    if (settlingRef.current) return;
    settlingRef.current = true;
    setSettling(true);
    setError(null);
    setDone(null);
    const chosen = m.owedToYou.filter((o) => picked.has(o.id));
    const failed: string[] = [];
    // A payment that landed is money in the books even if the status change
    // after it failed. Left picked, with its old balance, the next press
    // recorded the whole amount a second time.
    const unstatused: string[] = [];
    const paid = new Set<string>();
    for (const o of chosen) {
      try {
        const p = await paymentsStore.add({ invoiceId: o.id, date: today, amount: o.amount, method: null, note: "Marked as paid" });
        setPayments((prev) => [...prev, p]);
      } catch {
        failed.push(`#${o.what}`);
        continue;
      }
      paid.add(o.id);
      await invoicesStore
        .update(o.id, { status: "paid" })
        .then(() => setInvoices((prev) => prev.map((i) => (i.id === o.id ? { ...i, status: "paid" as const } : i))))
        .catch(() => unstatused.push(`#${o.what}`));
    }
    settlingRef.current = false;
    setSettling(false);
    const unsettled = unstatused.length ? ` The payment for ${unstatused.join(", ")} is recorded but it still says unpaid: open it and press Mark as paid.` : "";
    if (failed.length || unstatused.length) {
      setError(failed.length ? `Couldn't record ${failed.join(", ")}. The others went through.${unsettled}` : unsettled.trim());
      setPicked((prev) => new Set([...prev].filter((id) => !paid.has(id))));
    } else {
      setDone(`${chosen.length} marked paid.`);
      setPicking(false);
      setPicked(new Set());
    }
  }

  async function markBillPaid(row: Owed) {
    if (paying.current) return;
    paying.current = true;
    setError(null);
    setDone(null);
    try {
      await receiptsStore.update(row.id, { paid: true });
      setReceipts((prev) => prev.map((r) => (r.id === row.id ? { ...r, paid: true } : r)));
      setDone(`${row.who} marked paid.`);
    } catch (err) {
      setError(saveFailed(err, "Couldn't mark that bill paid."));
    } finally {
      paying.current = false;
    }
  }

  const Row = ({ row, side }: { row: Owed; side: "in" | "out" }) => (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b py-3 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium wrap-anywhere">{row.who || "No name"}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${WHEN[row.when].className}`}>
            {row.when === "late" ? `${row.daysLate} day${row.daysLate === 1 ? "" : "s"} late` : WHEN[row.when].label}
          </span>
        </span>
        <span className="block text-xs text-neutral-500 wrap-anywhere">
          {row.what}
          {row.what && row.dueDate ? " · " : ""}
          {row.dueDate ? `due ${shortDate(row.dueDate)}` : ""}
        </span>
      </span>
      <span className="flex flex-wrap items-center justify-end gap-x-3">
        <span className="font-medium">{money(row.amount)}</span>
        {side === "in" && picking ? (
          <input
            type="checkbox"
            aria-label={`Paid: #${row.what} ${row.who}`}
            className="size-5"
            checked={picked.has(row.id)}
            onChange={(e) =>
              setPicked((prev) => {
                const next = new Set(prev);
                if (e.target.checked) next.add(row.id);
                else next.delete(row.id);
                return next;
              })
            }
          />
        ) : side === "in" ? (
          <Link href={`/invoices/${row.id}`} className="inline-block py-1 text-sm font-medium text-neutral-700 underline">Chase</Link>
        ) : (
          <button onClick={() => markBillPaid(row)} className="inline-block py-1 text-sm font-medium text-neutral-700 underline">Mark paid</button>
        )}
      </span>
    </li>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Money</h1>
        <p className="mt-1 text-neutral-600">Everything owed to you and everything you owe, latest first.</p>
      </div>
      <Tip id="money-how">How it works: what is late is at the top of each list. Mark a bill paid without leaving this page, or press Chase to open the invoice.</Tip>

      {loadError && <p role="alert" className="text-sm text-red-600">{loadError}</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <p role="status" className={done ? "rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700" : "sr-only"}>{done ?? ""}</p>

      {/* Nothing is shown when the read failed. "Owed to you £0.00" on a
          page that could not load is a figure that is not true, which is
          the same sin as an empty state standing in for a failure -- worse,
          because a zero looks like an answer. */}
      {loading ? (
        <p className="text-sm text-neutral-500">Loading&hellip;</p>
      ) : loadError ? null : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { label: "Owed to you", value: m.totalIn, late: m.lateIn },
              { label: "You owe", value: m.totalOut, late: m.lateOut },
              { label: "Difference", value: m.net, late: 0 },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border bg-white p-4 text-neutral-900 shadow-sm">
                <p className="text-xs text-neutral-500 wrap-anywhere">{s.label}</p>
                <p className="mt-1 text-base font-semibold wrap-anywhere">{money(s.value)}</p>
                {s.late > 0 && <p className="text-xs text-red-700 wrap-anywhere">{money(s.late)} late</p>}
              </div>
            ))}
          </div>

          <section aria-labelledby="owed-to-you" className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="owed-to-you" className="font-semibold">Owed to you</h2>
              {m.owedToYou.length > 1 && (
                <button
                  type="button"
                  onClick={() => { setPicking((v) => !v); setPicked(new Set()); }}
                  className="inline-block py-1 text-sm font-medium text-neutral-700 underline"
                >
                  {picking ? "Done" : "Mark several paid"}
                </button>
              )}
            </div>
            {picking && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => setPicked(new Set(m.owedToYou.map((o) => o.id)))} className="rounded-lg border px-2 py-1 text-xs font-medium text-neutral-700">
                  All of them
                </button>
                {[...new Set(m.owedToYou.map((o) => o.who).filter(Boolean))].slice(0, 4).map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setPicked(new Set(m.owedToYou.filter((o) => o.who === name).map((o) => o.id)))}
                    className="rounded-lg border px-2 py-1 text-xs font-medium text-neutral-700"
                  >
                    All from {name}
                  </button>
                ))}
              </div>
            )}
            {m.owedToYou.length === 0 && !error ? (
              <p className="mt-2 text-sm text-neutral-500">Nothing outstanding. Every invoice you have sent is settled.</p>
            ) : (
              <ul className="mt-2">{m.owedToYou.map((row) => <Row key={row.id} row={row} side="in" />)}</ul>
            )}
            {picking && picked.size > 0 && (
              <button
                type="button"
                disabled={settling}
                onClick={markPickedPaid}
                className="mt-3 w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {settling
                  ? "Recording…"
                  : `Mark ${picked.size} paid · ${money(m.owedToYou.filter((o) => picked.has(o.id)).reduce((t, o) => t + o.amount, 0))}`}
              </button>
            )}
            {m.lateIn > 0 && (
              <div className="mt-4 space-y-1.5 border-t pt-3">
                <h3 className="text-sm font-medium">How late it is</h3>
                {lateness.map((b) => (
                  <div key={b.label} className="flex items-center justify-between text-sm">
                    <span className="text-neutral-600">{b.label}</span>
                    <span className="font-medium">{money(b.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="you-owe" className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
            <h2 id="you-owe" className="font-semibold">You owe</h2>
            {m.youOwe.length === 0 && !error ? (
              <p className="mt-2 text-sm text-neutral-500">No bills to pay. A supplier invoice you scan appears here until it is paid.</p>
            ) : (
              <ul className="mt-2">{m.youOwe.map((row) => <Row key={row.id} row={row} side="out" />)}</ul>
            )}
          </section>

          <section id="tax" aria-label="Tax so far">
            <TaxSoFar estimate={tax} />
          </section>
        </>
      )}
    </div>
  );
}
