"use client";

import { draftWhen } from "@/lib/formDraft";

// The half-typed form kept on this device, offered back when the form opens.
export default function DraftOffer({ what, savedAt, note, onRestore, onDiscard }: { what: string; savedAt: string; note?: string; onRestore: () => void; onDiscard: () => void }) {
  return (
    <div role="status" className="rounded-xl border bg-white p-4 text-sm text-neutral-900 shadow-sm">
      <p>
        You were writing {what} {draftWhen(savedAt)}. It was kept on this device.
        {note && ` ${note}`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onRestore} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          Carry on with it
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Throw away the ${what.replace(/^an? /, "")} you were writing? It can't be got back.`)) onDiscard();
          }}
          className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700"
        >
          Throw it away
        </button>
      </div>
    </div>
  );
}
