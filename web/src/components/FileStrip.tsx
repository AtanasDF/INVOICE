"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Receipt, Invoice } from "@/lib/storage";
import DateRoller, { RollerValue } from "@/components/DateRoller";
import { todayISO } from "@/lib/today";
import { shortDate } from "@/lib/dates";
import { money } from "@/lib/money";

// The file library, on the page he keeps coming back to (Atanas, 2026-09-24).
// One rectangle with a switch, not two stacked -- which is the mistake taken
// off this dashboard the same morning, where the Add sheet repeated the four
// buttons above it.
//
// Top to bottom, as he described it: a title that opens the whole library, a
// switch between the pictures and the files, a roller for the date, a button
// for a period of his own, and the documents themselves in a strip that slides
// sideways -- deliberately bigger than the tiles around it, because a picture
// you cannot recognise at a glance is not worth showing.
//
// Photos shows what has a picture. Files shows everything saved, INCLUDING the
// records whose photograph has been emailed away and cleared -- which is the
// gap he spotted in the ageing job: the record always survives, so there must
// always be a file, even when the picture has gone.
type Doc = { id: string; href: string; date: string; title: string; note: string; src: string | null; aged: boolean };

export default function FileStrip({ receipts, invoices }: { receipts: Receipt[]; invoices: Invoice[] }) {
  const [mode, setMode] = useState<"photos" | "files">("photos");
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [pickingRange, setPickingRange] = useState(false);
  const thisYear = Number(todayISO().slice(0, 4));
  const [when, setWhen] = useState<RollerValue>({ year: thisYear, month: null, day: null });

  const all = useMemo<Doc[]>(() => {
    const fromReceipts = receipts.map((r) => ({
      id: `r-${r.id}`,
      href: `/receipts?open=${r.id}`,
      date: r.date,
      title: r.vendor || "Receipt",
      note: money(r.amount ?? 0),
      src: r.imageDataUrl ?? null,
      aged: !!r.details?.photoAgedAt,
    }));
    const fromInvoices = invoices.map((i) => ({
      id: `i-${i.id}`,
      href: `/invoices/${i.id}`,
      date: i.date,
      title: i.number ? `Invoice ${i.number}` : "Draft invoice",
      note: i.status,
      src: null,
      aged: false,
    }));
    return [...fromReceipts, ...fromInvoices].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [receipts, invoices]);

  // Every year from the oldest thing kept to this one, with no gaps. Atanas
  // saw the skipped years and was right to doubt them: a dial that jumps from
  // 2026 to 2023 makes somebody wonder what happened to the two in between,
  // and "nothing in 2024" is itself an answer. Same reasoning as the days.
  const years = useMemo(() => {
    let oldest = thisYear;
    for (const d of all) if (d.date) oldest = Math.min(oldest, Number(d.date.slice(0, 4)));
    return Array.from({ length: thisYear - oldest + 1 }, (_, i) => thisYear - i);
  }, [all, thisYear]);

  const has = useMemo(() => new Set(all.map((d) => d.date)), [all]);

  const shown = useMemo(() => {
    const byMode = mode === "photos" ? all.filter((d) => d.src) : all;
    if (range) return byMode.filter((d) => d.date >= range.from && d.date <= range.to);
    return byMode.filter((d) => {
      if (!d.date.startsWith(String(when.year))) return false;
      if (when.month === null) return true;
      const m = String(when.month + 1).padStart(2, "0");
      if (d.date.slice(5, 7) !== m) return false;
      if (when.day === null) return true;
      return Number(d.date.slice(8, 10)) === when.day;
    });
  }, [all, mode, when, range]);

  // min-w-0: a flex-1 button still will not go below its own words, so at
  // 320px with the text turned up this switch pushed the page sideways.
  const SWITCH = "min-w-0 flex-1 rounded-md px-3 py-1.5 text-sm font-medium";

  return (
    <section aria-label="Your file library" className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/files" className="text-lg font-bold underline-offset-2 hover:underline">
          Your file library &rarr;
        </Link>
        <span className="text-xs text-neutral-500">{shown.length} of {all.length}</span>
      </div>

      {/* Not role="tab": this switches what the strip is filtered to, it does
          not switch between panels, and there is no tabpanel for it. Calling
          it a tab also made every count of the dashboard's three panels find
          five. A pressed button is what it actually is. */}
      <div role="group" aria-label="Pictures or files" className="flex gap-1 rounded-lg bg-neutral-100 p-1">
        {(["photos", "files"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`${SWITCH} ${mode === m ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}
          >
            {m === "photos" ? "Photos" : "Files"}
          </button>
        ))}
      </div>

      {!range && <DateRoller value={when} onChange={setWhen} years={years} has={has} />}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { setPickingRange((v) => !v); if (range) setRange(null); }}
          className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700"
        >
          {range ? "Back to the roller" : "Pick a period"}
        </button>
        {range && <span className="text-xs text-neutral-600">{shortDate(range.from)} to {shortDate(range.to)}</span>}
      </div>

      {pickingRange && !range && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-lg border bg-neutral-50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const from = String(f.get("from") ?? "");
            const to = String(f.get("to") ?? "");
            if (from && to) { setRange({ from: from < to ? from : to, to: from < to ? to : from }); setPickingRange(false); }
          }}
        >
          <label className="flex flex-col gap-0.5 text-xs text-neutral-500">From<input type="date" name="from" required className="rounded-lg border px-3 py-2 text-sm" /></label>
          <label className="flex flex-col gap-0.5 text-xs text-neutral-500">To<input type="date" name="to" required className="rounded-lg border px-3 py-2 text-sm" /></label>
          <button type="submit" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">Show them</button>
        </form>
      )}

      {/* Sideways, about five on screen, each big enough to recognise. The
          scrollbar is the browser's own, so it works with a thumb, a wheel and
          a keyboard without any of it being written here. */}
      {shown.length > 0 ? (
        <ul className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
          {shown.map((d) => (
            <li key={d.id} className="w-28 shrink-0 snap-start sm:w-32">
              <Link href={d.href} className="block rounded-lg border bg-white p-1.5 text-left">
                <span className="flex h-28 items-center justify-center overflow-hidden rounded bg-neutral-100 sm:h-32">
                  {d.src ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={d.src} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="px-1 text-center text-[10px] leading-tight text-neutral-500">
                      {d.aged ? "Emailed to you" : "No picture"}
                    </span>
                  )}
                </span>
                <span className="mt-1 block truncate text-xs font-medium">{d.title}</span>
                <span className="block truncate text-[11px] text-neutral-500">{shortDate(d.date)} · {d.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border bg-neutral-50 p-3 text-sm text-neutral-600">
          {mode === "photos" ? "No pictures" : "Nothing"} {range ? "in that period" : when.day !== null ? "on that day" : when.month !== null ? "that month" : "that year"}.
          {" "}Roll to another date, or{" "}
          <Link href="/files" className="font-medium underline">open the whole library</Link>.
        </p>
      )}
    </section>
  );
}
