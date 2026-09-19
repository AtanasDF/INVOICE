"use client";

import { useId } from "react";
import { CIS_RATES, CIS_RATE_LABELS, cisDeduction, labourNet } from "@/lib/cis";
import type { InvoiceItem } from "@/lib/storage";

// The CIS switch on an invoice being written: on, the contractor keeps back
// the rate from the labour lines.
export function CisToggle({ rate, onChange }: { rate: number | null; onChange: (rate: number | null) => void }) {
  const id = useId();
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={rate !== null} onChange={(e) => onChange(e.target.checked ? 20 : null)} />
        <span>
          <span className="font-medium">CIS subcontractor</span>
          <span className="block text-xs text-neutral-500">
            The contractor keeps back CIS from the labour and pays it to HMRC for you. Mark each line as labour or materials.
          </span>
        </span>
      </label>
      {rate !== null && (
        <div>
          <label className="text-xs text-neutral-500" htmlFor={id}>
            CIS rate
          </label>
          <select id={id} className="w-full rounded-lg border px-3 py-2 text-sm" value={rate} onChange={(e) => onChange(Number(e.target.value))}>
            {CIS_RATES.map((r) => (
              <option key={r} value={r}>
                {CIS_RATE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export function LineKind({ item, onChange }: { item: InvoiceItem; onChange: (kind: "labour" | "materials") => void }) {
  const kind = item.kind ?? "labour";
  return (
    <div className="col-span-12 flex items-center gap-1 text-xs" role="group" aria-label="Labour or materials">
      {(["labour", "materials"] as const).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          aria-pressed={kind === k}
          className={`rounded-full border px-2.5 py-0.5 ${kind === k ? "border-neutral-900 bg-neutral-900 text-white" : "text-neutral-600"}`}
        >
          {k === "labour" ? "Labour" : "Materials"}
        </button>
      ))}
    </div>
  );
}

// Under the total while writing a CIS invoice: the deduction and what the
// customer will actually pay.
export function CisSummary({ items, rate, total }: { items: InvoiceItem[]; rate: number | null; total: number }) {
  if (!rate) return null;
  const cis = cisDeduction(items, rate);
  return (
    <>
      <div className="flex justify-end text-neutral-600">
        <span>
          CIS deduction ({rate}% of £{labourNet(items).toFixed(2)} labour):{" "}
          <span className="whitespace-nowrap">−£{cis.toFixed(2)}</span>
        </span>
      </div>
      <div className="flex justify-end font-medium">
        <span>The contractor pays you: £{(Math.round((total - cis) * 100) / 100).toFixed(2)}</span>
      </div>
    </>
  );
}
