"use client";

import { useEffect, useMemo, useState } from "react";
import { Receipt, receiptsStore } from "@/lib/storage";

function monthKey(dateStr: string) {
  return dateStr.slice(0, 7);
}

export default function ExpensesPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  useEffect(() => {
    setReceipts(receiptsStore.all());
  }, []);

  const monthReceipts = useMemo(
    () => receipts.filter((r) => monthKey(r.date) === month),
    [receipts, month]
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, { total: number; vat: number }>();
    for (const r of monthReceipts) {
      const entry = map.get(r.category) || { total: 0, vat: 0 };
      entry.total += r.amount;
      entry.vat += r.vatAmount;
      map.set(r.category, entry);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [monthReceipts]);

  const totals = monthReceipts.reduce(
    (acc, r) => ({ total: acc.total + r.amount, vat: acc.vat + r.vatAmount }),
    { total: 0, vat: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Monthly expenses</h1>
        <input type="month" className="rounded-lg border px-3 py-2" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="text-2xl font-bold">£{totals.total.toFixed(2)}</div>
          <div className="text-sm text-neutral-600">Total business costs</div>
        </div>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="text-2xl font-bold">£{totals.vat.toFixed(2)}</div>
          <div className="text-sm text-neutral-600">VAT to keep for review</div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="font-semibold">By category</h2>
        {byCategory.length === 0 && <p className="mt-2 text-sm text-neutral-500">No costs recorded for this month.</p>}
        <div className="mt-3 space-y-2">
          {byCategory.map(([cat, v]) => (
            <div key={cat} className="flex items-center justify-between border-b pb-2 text-sm">
              <span>{cat}</span>
              <span className="text-neutral-600">£{v.total.toFixed(2)} · VAT £{v.vat.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        These figures are for your own records and to help with VAT review — they are not a substitute for
        professional accounting advice.
      </p>
    </div>
  );
}
