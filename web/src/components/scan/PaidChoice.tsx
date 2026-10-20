"use client";

import { useId } from "react";

export default function PaidChoice({ paid, onChange }: { paid: boolean; onChange: (paid: boolean) => void }) {
  const id = useId();
  const option = (value: boolean, label: string) => (
    <button
      type="button"
      onClick={() => onChange(value)}
      aria-pressed={paid === value}
      className={`min-w-0 flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${paid === value ? "bg-neutral-900 text-white" : "text-neutral-700"}`}
    >
      {label}
    </button>
  );
  return (
    <div>
      <p id={id} className="text-xs text-neutral-500">Payment</p>
      <div role="group" aria-labelledby={id} className="mt-1 flex gap-1 rounded-lg border p-1">
        {option(true, "Already paid")}
        {option(false, "To be paid")}
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        {paid
          ? "Recorded as a paid expense."
          : "Kept as a bill. You'll be reminded 3 days before it's due."}
      </p>
    </div>
  );
}
