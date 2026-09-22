"use client";

import { DOCUMENT_DETAIL_LABELS, DocumentDetails } from "@/lib/storage";

type DetailKey = keyof typeof DOCUMENT_DETAIL_LABELS;

const KEYS = Object.keys(DOCUMENT_DETAIL_LABELS) as DetailKey[];

export default function DocumentDetailsFields({ details, onChange }: {
  details: DocumentDetails;
  onChange: (next: DocumentDetails) => void;
}) {
  const present = KEYS.filter((k) => details[k] !== undefined);
  const other = details.other ?? [];

  function setOther(index: number, patch: Partial<{ label: string; value: string }>) {
    onChange({ ...details, other: other.map((o, i) => (i === index ? { ...o, ...patch } : o)) });
  }

  return (
    <div className="space-y-3">
      {present.length + other.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {present.map((k) => (
            <div key={k}>
              <label className="text-xs text-neutral-500">{DOCUMENT_DETAIL_LABELS[k]}</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                value={details[k] ?? ""}
                onChange={(e) => onChange({ ...details, [k]: e.target.value })}
              />
            </div>
          ))}
          {other.map((o, i) => (
            <div key={`other-${i}`}>
              <label className="text-xs text-neutral-500">{o.label || "Other detail"}</label>
              <div className="grid grid-cols-3 gap-2">
                <input
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="Label"
                  value={o.label}
                  onChange={(e) => setOther(i, { label: e.target.value })}
                />
                <input
                  className="col-span-2 w-full rounded-lg border px-3 py-2"
                  placeholder="Value"
                  value={o.value}
                  onChange={(e) => setOther(i, { value: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => onChange({ ...details, other: [...other, { label: "", value: "" }] })}
        className="text-sm font-medium text-neutral-700 underline"
      >
        + Add a detail
      </button>
    </div>
  );
}
