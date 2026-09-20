"use client";

import { ReactNode, useState } from "react";

export const INPUT = "w-full rounded-lg border px-3 py-2";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="block">
        <span className="text-xs text-neutral-500">{label}</span>
        {children}
      </label>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

// Holds the raw text so "1." and a cleared field survive typing; the
// parsed number is what the draft stores.
// What's shown must be what's stored: "1,200.50" is 1200.5 and a decimal
// comma ("2,5") is 2.5, where parseFloat alone would store 1 and 2.
export function parseAmount(text: string): number {
  return amountOrNull(text) ?? 0;
}

// The same reading, but able to say "there is something here and it isn't a
// number". parseAmount answers 0 to both an empty box and to "12.50 per
// length", which is right for a form where 0 means nothing typed and wrong
// anywhere a price is being judged: a supplier answering a quote request
// that way had their line taken as £0.00 and won the comparison on it.
export function amountOrNull(text: string): number | null {
  let t = text.replace(/[\s£$€]/g, "");
  if (!t) return null;
  if (t.includes(",") && !t.includes(".") && /^-?\d+,\d{1,2}$/.test(t)) t = t.replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function NumberInput({ value, onChange, className = INPUT, ...rest }: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(value === 0 ? "" : String(value));
  const [seen, setSeen] = useState(value);
  if (!Object.is(value, seen)) {
    setSeen(value);
    if (parseAmount(text) !== value) setText(value === 0 ? "" : String(value));
  }
  return (
    <input
      {...rest}
      inputMode="decimal"
      className={className}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseAmount(e.target.value));
      }}
    />
  );
}

export function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-4 py-1 text-left">
      <span>
        <span className="text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-neutral-500">{description}</span>}
      </span>
      <span className={`relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-neutral-900" : "bg-neutral-300"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label, className = "" }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label?: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`flex w-fit rounded-lg border text-sm ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-4 py-1.5 first:rounded-l-lg last:rounded-r-lg ${value === o.value ? "bg-neutral-900 text-white" : "text-neutral-600"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
