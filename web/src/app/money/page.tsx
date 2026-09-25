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
      .catch((err) => setError(loadFailed(err, "your money")))
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
        {side === "in" ? (
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
      <Tip id="money-how">How it works: what is late is at the top of each list. Chase an invoice, or mark a bill paid, without leaving this page.</Tip>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {done && <p role="status" className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">{done}</p>}

      {/* Nothing is shown when the read failed. "Owed to you £0.00" on a
          page that could not load is a figure that is not true, which is
          the same sin as an empty state standing in for a failure -- worse,
          because a zero looks like an answer. */}
      {loading ? (
        <p className="text-sm text-neutral-500">Loading&hellip;</p>
      ) : error ? null : (
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
            <h2 id="owed-to-you" className="font-semibold">Owed to you</h2>
            {m.owedToYou.length === 0 && !error ? (
              <p className="mt-2 text-sm text-neutral-500">Nothing outstanding. Every invoice you have sent is settled.</p>
            ) : (
              <ul className="mt-2">{m.owedToYou.map((row) => <Row key={row.id} row={row} side="in" />)}</ul>
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
        </>
      )}
    </div>
  );
}
