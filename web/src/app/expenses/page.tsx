"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Invoice, Receipt, invoicesStore, receiptsStore } from "@/lib/storage";

function monthKey(dateStr: string) {
  return dateStr.slice(0, 7);
}
function yearKey(dateStr: string) {
  return dateStr.slice(0, 4);
}
// <input type="week"> isn't supported on Safari (desktop or iOS), so weeks
// are picked via a plain date input -- whatever day you pick, we show the
// Mon-Sun week it falls in.
//
// UTC methods throughout: parsing "T00:00:00" (or the (y,m,d) constructor)
// builds LOCAL midnight, and converting that back with toISOString() (UTC)
// shifts the result by a day whenever the viewer's timezone offset isn't
// zero -- confirmed this breaks in both directions depending on the
// offset, not just for far-flung timezones, so every step here stays UTC.
function startOfWeek(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
function endOfWeek(dateStr: string): string {
  const d = new Date(startOfWeek(dateStr));
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}
function invoiceTotal(inv: Invoice) {
  return inv.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
}

export default function ExpensesPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodMode, setPeriodMode] = useState<"week" | "month" | "year">("month");
  const [weekAnchor, setWeekAnchor] = useState(() => new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const [viewMode, setViewMode] = useState<"expenses" | "combined">("expenses");

  useEffect(() => {
    Promise.all([receiptsStore.all(), invoicesStore.all()]).then(([r, i]) => {
      setReceipts(r);
      setInvoices(i);
      setLoading(false);
    });
  }, []);

  const weekStart = periodMode === "week" ? startOfWeek(weekAnchor) : "";
  const weekEnd = periodMode === "week" ? endOfWeek(weekAnchor) : "";

  const periodReceipts = useMemo(
    () =>
      receipts.filter((r) => {
        // Excludes anything still needing review -- an emailed-in receipt
        // nobody's confirmed yet shouldn't count toward these figures
        // until it's actually been checked.
        if (r.needsReview) return false;
        if (periodMode === "week") return r.date >= weekStart && r.date <= weekEnd;
        if (periodMode === "month") return monthKey(r.date) === month;
        return yearKey(r.date) === year;
      }),
    [receipts, periodMode, month, year, weekStart, weekEnd]
  );
  const periodInvoices = useMemo(
    () =>
      invoices.filter((i) => {
        if (periodMode === "week") return i.date >= weekStart && i.date <= weekEnd;
        if (periodMode === "month") return monthKey(i.date) === month;
        return yearKey(i.date) === year;
      }),
    [invoices, periodMode, month, year, weekStart, weekEnd]
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, { total: number; vat: number }>();
    for (const r of periodReceipts) {
      const itemsTotal = r.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
      if (r.lineItems.length === 0 || itemsTotal <= 0) {
        const entry = map.get(r.category) || { total: 0, vat: 0 };
        entry.total += r.amount;
        entry.vat += r.vatAmount;
        map.set(r.category, entry);
        continue;
      }
      // Split the receipt across each item's own category (uncategorized
      // items fall back to the receipt's overall category), scaling each
      // share proportionally so the categories always sum back to exactly
      // r.amount / r.vatAmount even if the item totals don't quite match
      // the receipt total (rounding, an AI misread, etc).
      const perCategoryAmount = new Map<string, number>();
      for (const li of r.lineItems) {
        const cat = li.category || r.category;
        perCategoryAmount.set(cat, (perCategoryAmount.get(cat) ?? 0) + li.quantity * li.unitPrice);
      }
      for (const [cat, amt] of perCategoryAmount) {
        const share = amt / itemsTotal;
        const entry = map.get(cat) || { total: 0, vat: 0 };
        entry.total += r.amount * share;
        entry.vat += r.vatAmount * share;
        map.set(cat, entry);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [periodReceipts]);

  const totals = periodReceipts.reduce(
    (acc, r) => ({ total: acc.total + r.amount, vat: acc.vat + r.vatAmount }),
    { total: 0, vat: 0 }
  );
  const income = periodInvoices.reduce((s, inv) => s + invoiceTotal(inv), 0);
  const expensesInclVat = totals.total + totals.vat;
  const chartData = byCategory.map(([category, v]) => ({ category, spend: Number((v.total + v.vat).toFixed(2)) }));

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  const periodLabel =
    periodMode === "week" ? `${startOfWeek(weekAnchor)} to ${endOfWeek(weekAnchor)}` : periodMode === "month" ? month : year;
  const periodTitle = periodMode === "week" ? "Weekly" : periodMode === "month" ? "Monthly" : "Yearly";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-2xl font-bold">{periodTitle} expenses</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border text-sm">
            <button
              onClick={() => setPeriodMode("week")}
              className={`px-3 py-1.5 ${periodMode === "week" ? "bg-neutral-900 text-white" : "text-neutral-600"}`}
            >
              Week
            </button>
            <button
              onClick={() => setPeriodMode("month")}
              className={`px-3 py-1.5 ${periodMode === "month" ? "bg-neutral-900 text-white" : "text-neutral-600"}`}
            >
              Month
            </button>
            <button
              onClick={() => setPeriodMode("year")}
              className={`px-3 py-1.5 ${periodMode === "year" ? "bg-neutral-900 text-white" : "text-neutral-600"}`}
            >
              Year
            </button>
          </div>
          {periodMode === "week" ? (
            <input type="date" className="rounded-lg border px-3 py-2" value={weekAnchor} onChange={(e) => setWeekAnchor(e.target.value)} />
          ) : periodMode === "month" ? (
            <input type="month" className="rounded-lg border px-3 py-2" value={month} onChange={(e) => setMonth(e.target.value)} />
          ) : (
            <input
              type="number"
              className="w-28 rounded-lg border px-3 py-2"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          )}
          <button onClick={() => window.print()} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
            Print / save as PDF
          </button>
        </div>
      </div>

      <div className="hidden print:block">
        <h1 className="text-2xl font-bold">Expense summary — {periodLabel}</h1>
        <p className="text-sm text-neutral-500">{viewMode === "combined" ? "Combined with invoices" : "Expenses only"}</p>
      </div>

      <div className="flex rounded-lg border text-sm w-fit print:hidden">
        <button
          onClick={() => setViewMode("expenses")}
          className={`px-3 py-1.5 ${viewMode === "expenses" ? "bg-neutral-900 text-white" : "text-neutral-600"}`}
        >
          Expenses only
        </button>
        <button
          onClick={() => setViewMode("combined")}
          className={`px-3 py-1.5 ${viewMode === "combined" ? "bg-neutral-900 text-white" : "text-neutral-600"}`}
        >
          Combined with invoices
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:border-0 print:shadow-none print:px-0">
          <div className="text-2xl font-bold">£{totals.total.toFixed(2)}</div>
          <div className="text-sm text-neutral-600">Total excl. VAT</div>
        </div>
        <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:border-0 print:shadow-none print:px-0">
          <div className="text-2xl font-bold">£{totals.vat.toFixed(2)}</div>
          <div className="text-sm text-neutral-600">VAT to keep for review</div>
        </div>
        <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:border-0 print:shadow-none print:px-0">
          <div className="text-2xl font-bold">£{expensesInclVat.toFixed(2)}</div>
          <div className="text-sm text-neutral-600">Total incl. VAT</div>
        </div>
      </div>

      {viewMode === "combined" && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:border-0 print:shadow-none print:px-0">
            <div className="text-2xl font-bold">£{income.toFixed(2)}</div>
            <div className="text-sm text-neutral-600">Invoiced (income)</div>
          </div>
          <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:border-0 print:shadow-none print:px-0">
            <div className="text-2xl font-bold">£{expensesInclVat.toFixed(2)}</div>
            <div className="text-sm text-neutral-600">Spent (incl. VAT)</div>
          </div>
          <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:border-0 print:shadow-none print:px-0">
            <div className={`text-2xl font-bold ${income - expensesInclVat < 0 ? "text-red-600" : ""}`}>
              £{(income - expensesInclVat).toFixed(2)}
            </div>
            <div className="text-sm text-neutral-600">Net</div>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:border-0 print:shadow-none print:px-0">
        <h2 className="font-semibold">By category</h2>
        {byCategory.length === 0 && <p className="mt-2 text-sm text-neutral-500">No costs recorded for this {periodMode}.</p>}
        {chartData.length > 0 && (
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                <XAxis dataKey="category" tick={{ fontSize: 12, fill: "#737373" }} axisLine={{ stroke: "#e5e5e5" }} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#737373" }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `£${v}`} />
                <Tooltip
                  formatter={(value) => [`£${Number(value).toFixed(2)}`, "Spend incl. VAT"]}
                  contentStyle={{ borderRadius: 8, borderColor: "#e5e5e5", fontSize: 13 }}
                />
                <Bar dataKey="spend" fill="#171717" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-3 space-y-2">
          {byCategory.map(([cat, v]) => (
            <div key={cat} className="flex items-center justify-between border-b pb-2 text-sm">
              <span>{cat}</span>
              <span className="text-neutral-600">
                £{v.total.toFixed(2)} excl. VAT · £{(v.total + v.vat).toFixed(2)} incl. VAT
              </span>
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
