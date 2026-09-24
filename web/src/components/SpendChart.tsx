"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/money";

// The Expenses page's bars, in a file of their own so the chart library
// (about 360 KB) loads only where a chart is drawn: imported by the page
// itself, it went out to every signed-in page that shows a link to
// Expenses, since Next preloads what a visible link opens.
//
// The colours were hard-coded hexes, which the house style forbids for a
// reason this chart shows plainly: #171717 bars are the grey theme's
// darkest ink, and in dark mode that is a black bar on a near-black card.
// Recharts wants real colour values rather than CSS variables, so they are
// read off the page once it has painted and re-read when the theme changes.
const INK = "--n-900";
const GRID = "--n-200";
const LABEL = "--n-500";
const PAPER = "--paper";

function useThemeColours() {
  const [c, setC] = useState({ ink: "#171717", grid: "#e5e5e5", label: "#737373", paper: "#ffffff" });
  useEffect(() => {
    const read = () => {
      const s = getComputedStyle(document.documentElement);
      const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
      setC({ ink: v(INK, "#171717"), grid: v(GRID, "#e5e5e5"), label: v(LABEL, "#737373"), paper: v(PAPER, "#ffffff") });
    };
    read();
    // A theme is a data-theme on <html>; picking one repaints this chart.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return c;
}

export default function SpendChart({ data }: { data: { category: string; spend: number }[] }) {
  const c = useThemeColours();
  const total = data.reduce((s, d) => s + d.spend, 0);
  // What the picture says, for anyone who cannot see it. The bars carry no
  // information a screen reader can reach -- it was being read the axis
  // ticks, which come out as "Supplies £0 £30 £60 £90 £120".
  const spoken = data.length
    ? `Spending by category, ${money(total)} in total: ${data.map((d) => `${d.category}, ${money(d.spend)}`).join("; ")}.`
    : "No spending to chart for this period.";

  return (
    <>
      <p className="sr-only">{spoken}</p>
      <div aria-hidden="true" className="h-full w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
            <XAxis dataKey="category" tick={{ fontSize: 12, fill: c.label }} axisLine={{ stroke: c.grid }} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: c.label }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `£${v}`} />
            <Tooltip formatter={(value) => [`${money(Number(value))}`, "Spend incl. VAT"]} contentStyle={{ borderRadius: 8, borderColor: c.grid, backgroundColor: c.paper, color: c.ink, fontSize: 13 }} />
            <Bar dataKey="spend" fill={c.ink} radius={[4, 4, 0, 0]} maxBarSize={80} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
