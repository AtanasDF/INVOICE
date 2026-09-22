"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/money";

// The Expenses page's bars, in a file of their own so the chart library
// (about 360 KB) loads only where a chart is drawn: imported by the page
// itself, it went out to every signed-in page that shows a link to
// Expenses, since Next preloads what a visible link opens.
export default function SpendChart({ data }: { data: { category: string; spend: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
        <XAxis dataKey="category" tick={{ fontSize: 12, fill: "#737373" }} axisLine={{ stroke: "#e5e5e5" }} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "#737373" }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `£${v}`} />
        <Tooltip formatter={(value) => [`${money(Number(value))}`, "Spend incl. VAT"]} contentStyle={{ borderRadius: 8, borderColor: "#e5e5e5", fontSize: 13 }} />
        <Bar dataKey="spend" fill="#171717" radius={[4, 4, 0, 0]} maxBarSize={80} />
      </BarChart>
    </ResponsiveContainer>
  );
}
