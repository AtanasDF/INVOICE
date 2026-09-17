"use client";

import type { InvoiceLayoutStyle } from "@/lib/invoiceTemplate";

const bar = (w: string, tone = "bg-neutral-300", h = "h-0.5") => <div className={`${h} ${w} rounded-sm ${tone}`} />;
const rows = (n: number) => Array.from({ length: n }, (_, i) => <div key={i} className="h-0.5 w-full rounded-sm bg-neutral-200" />);

const THUMBS: Record<InvoiceLayoutStyle, React.ReactNode> = {
  classic: (
    <div className="flex h-full flex-col items-center gap-1">
      {bar("w-1/2", "bg-neutral-800", "h-1")}
      {bar("w-1/3")}
      <div className="w-full border-t border-neutral-400" />
      {bar("w-1/4", "bg-neutral-800")}
      <div className="mt-1 w-full space-y-1">
        {bar("w-1/3")}
        {bar("w-1/4")}
      </div>
      <div className="mt-1 w-full space-y-1">{rows(3)}</div>
      {bar("w-1/3 self-end", "bg-neutral-800")}
      <div className="mt-auto h-3 w-full rounded-sm border border-neutral-400" />
    </div>
  ),
  modern: (
    <div className="flex h-full flex-col gap-1">
      <div className="flex justify-between">
        <div className="w-2/5 space-y-1">
          {bar("w-full", "bg-neutral-800", "h-1.5")}
          {bar("w-3/4")}
        </div>
        <div className="w-1/4 space-y-1">
          {bar("w-full", "bg-neutral-800", "h-1")}
          {bar("w-full")}
          {bar("w-full")}
        </div>
      </div>
      <div className="mt-2 space-y-1">
        {bar("w-1/3")}
        {bar("w-1/4")}
      </div>
      <div className="mt-2 space-y-1">{rows(3)}</div>
      {bar("w-full", "bg-neutral-800", "h-1")}
      <div className="mt-auto grid grid-cols-2 gap-1">
        {bar("w-2/3")}
        {bar("w-2/3")}
      </div>
    </div>
  ),
  compact: (
    <div className="flex h-full flex-col gap-0.5">
      <div className="flex items-end justify-between">
        {bar("w-1/3", "bg-neutral-800", "h-1")}
        {bar("w-2/5")}
      </div>
      <div className="mt-0.5 flex justify-between border-y border-neutral-500 py-0.5">
        {bar("w-1/4", "bg-neutral-800")}
        {bar("w-1/3")}
      </div>
      {bar("mt-0.5 w-1/3")}
      <div className="mt-0.5 space-y-0.5">{rows(6)}</div>
      {bar("w-1/3 self-end", "bg-neutral-800")}
      {bar("mt-auto w-full")}
    </div>
  ),
};

const OPTIONS: { value: InvoiceLayoutStyle; label: string; blurb: string }[] = [
  { value: "classic", label: "Classic", blurb: "Centred name, boxed bank details" },
  { value: "modern", label: "Modern", blurb: "Roomy, bold total" },
  { value: "compact", label: "Compact", blurb: "Dense, fits one page" },
];

export default function LayoutPicker({ value, onChange }: { value: InvoiceLayoutStyle; onChange: (v: InvoiceLayoutStyle) => void }) {
  return (
    <fieldset>
      <legend className="text-xs text-neutral-500">Layout</legend>
      <div className="mt-1 grid grid-cols-3 gap-3">
        {OPTIONS.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input type="radio" name="layout" value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="peer sr-only" />
            <div className="rounded-lg border p-2 peer-checked:border-neutral-900 peer-checked:ring-1 peer-checked:ring-neutral-900 peer-focus-visible:ring-2">
              <div className="aspect-[3/4] w-full rounded-sm border border-neutral-200 bg-white p-1.5">{THUMBS[o.value]}</div>
              <p className="mt-2 text-sm font-medium">{o.label}</p>
              <p className="text-xs text-neutral-500">{o.blurb}</p>
            </div>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
