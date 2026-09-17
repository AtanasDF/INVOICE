"use client";

export function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function DateConfirm({ iso, alternative, printed, onSwap, onConfirm }: {
  iso: string;
  alternative: string;
  printed: string | null;
  onSwap: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <p>
        Read as <span className="font-medium">{longDate(iso)}</span>
        {printed ? ` — the document shows ${printed}` : ""}. If it meant {longDate(alternative)}, swap.
      </p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={onSwap} className="rounded-lg border border-amber-300 px-3 py-1 text-xs font-medium text-amber-800">
          Swap
        </button>
        <button type="button" onClick={onConfirm} className="rounded-lg bg-neutral-900 px-3 py-1 text-xs font-medium text-white">
          Confirm
        </button>
      </div>
    </div>
  );
}
