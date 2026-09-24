"use client";

import { useEffect, useRef } from "react";

// Rolling to a date with a thumb (Atanas, 2026-09-24: "something like a
// roller, the one you just roll and the days are changing... so you can be
// looking for just year, going through the whole year, then you can focus on
// the whole month, and then on a specific day").
//
// Three columns, and you stop at whatever level you want: a year on its own
// means the whole year, add a month and it means that month, add a day and it
// means that day. "All" sits at the top of the month and day columns so you
// can widen again without starting over.
//
// Built on scroll-snap rather than on touch handlers, which is what makes his
// other answer work for free: "on a laptop it should just switch from the
// sections smoothly rather than swiping it." A snapping column rolls under a
// thumb, scrolls under a mouse wheel, and moves under the arrow keys -- one
// control, three ways to use it, no special case for the laptop.
//
// Days that have nothing are still there, with no dot. A dial that skips loses
// your sense of where you are in the month, and "nothing on the 4th" is itself
// an answer somebody may be looking for.
export type RollerValue = { year: number; month: number | null; day: number | null };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

export default function DateRoller({ value, onChange, years, has }: {
  value: RollerValue;
  onChange: (next: RollerValue) => void;
  years: number[];
  // Which days have something in them, as "YYYY-MM-DD". Only used to put a dot
  // under a day -- never to hide one.
  has?: Set<string>;
}) {
  // The months are always listed -- the whole point of the column is to pick
  // one when none is picked yet. Making the list conditional on a month
  // already being chosen left it permanently empty, and the test for it passed
  // anyway, because "all year" happened to hold the same documents as March.
  const dayCount = value.month === null ? 0 : daysIn(value.year, value.month);

  return (
    <div className="flex gap-2" role="group" aria-label="Choose a date">
      <Column
        label="Year"
        items={years.map((y) => ({ key: String(y), label: String(y), value: y }))}
        selected={String(value.year)}
        onPick={(y) => onChange({ year: y as number, month: value.month, day: null })}
      />
      <Column
        label="Month"
        items={[{ key: "all", label: "All year", value: null }, ...MONTHS.map((m, i) => ({ key: String(i), label: m.slice(0, 3), value: i }))]}
        selected={value.month === null ? "all" : String(value.month)}
        onPick={(m) => onChange({ year: value.year, month: m as number | null, day: null })}
      />
      <Column
        label="Day"
        disabled={value.month === null}
        items={[
          { key: "all", label: "All month", value: null },
          ...Array.from({ length: dayCount }, (_, i) => {
            const d = i + 1;
            const iso = `${value.year}-${String((value.month ?? 0) + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            return { key: String(d), label: String(d), value: d, dot: has?.has(iso) };
          }),
        ]}
        selected={value.day === null ? "all" : String(value.day)}
        onPick={(d) => onChange({ year: value.year, month: value.month, day: d as number | null })}
      />
    </div>
  );
}

function Column({ label, items, selected, onPick, disabled = false }: {
  label: string;
  items: { key: string; label: string; value: number | null; dot?: boolean }[];
  selected: string;
  onPick: (v: number | null) => void;
  disabled?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);

  // Keep what is chosen in the middle, including when it changes from outside
  // (the period button, or a year with no such month).
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(selected)}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selected]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const at = items.findIndex((i) => i.key === selected);
    const next = items[Math.min(items.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))];
    if (next) onPick(next.value);
  }

  return (
    <div className="min-w-0 flex-1">
      <span className="block text-xs text-neutral-500">{label}</span>
      <div
        ref={box}
        role="listbox"
        aria-label={label}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKey}
        className={`mt-1 h-28 snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-lg border bg-white text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 ${disabled ? "opacity-40" : ""}`}
      >
        {/* Half a row of air top and bottom, so the first and last items can
            sit in the middle like every other one. */}
        <div aria-hidden className="h-10" />
        {items.map((i) => (
          <button
            key={i.key}
            type="button"
            data-key={i.key}
            role="option"
            aria-selected={i.key === selected}
            disabled={disabled}
            onClick={() => onPick(i.value)}
            className={`flex h-9 w-full snap-center items-center justify-center gap-1 text-sm ${i.key === selected ? "font-bold text-neutral-900" : "text-neutral-500"}`}
          >
            {i.label}
            {i.dot && <span aria-hidden className="h-1 w-1 rounded-full bg-neutral-400" />}
          </button>
        ))}
        <div aria-hidden className="h-10" />
      </div>
    </div>
  );
}
