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
export function NumberInput({ value, onChange, className = INPUT, ...rest }: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(value === 0 ? "" : String(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if ((parseFloat(text) || 0) !== value) setText(value === 0 ? "" : String(value));
  }
  return (
    <input
      {...rest}
      inputMode="decimal"
      className={className}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseFloat(e.target.value) || 0);
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
