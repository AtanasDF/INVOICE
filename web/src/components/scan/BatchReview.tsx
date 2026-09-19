"use client";

import type { CapturedFile } from "@/components/DocumentCapture";
import { DocumentIcon } from "@/components/icons";

export type Shot = CapturedFile & { id: number; joinPrev: boolean };

// Consecutive shots marked "joinPrev" are further pages of the document
// before them.
// Removing a document's first page makes its next page the new first
// page, rather than letting it fall into the document before.
export function removeShot(shots: Shot[], id: number): Shot[] {
  const i = shots.findIndex((x) => x.id === id);
  if (i < 0) return shots;
  const promote = !shots[i].joinPrev || i === 0;
  return shots.filter((x) => x.id !== id).map((x, j) => (j === 0 || (promote && j === i) ? { ...x, joinPrev: false } : x));
}

export function groupShots(shots: Shot[]): CapturedFile[][] {
  const docs: CapturedFile[][] = [];
  for (const s of shots) {
    const file = { dataUrl: s.dataUrl, mediaType: s.mediaType };
    if (s.joinPrev && docs.length) docs[docs.length - 1].push(file);
    else docs.push([file]);
  }
  return docs;
}

export default function BatchReview({ shots, onChange, onKeepScanning, onAccept }: {
  shots: Shot[];
  onChange: (shots: Shot[]) => void;
  onKeepScanning: () => void;
  onAccept: () => void;
}) {
  const docs = groupShots(shots).length;
  const labels: string[] = [];
  let doc = 0;
  let page = 1;
  for (const [i, s] of shots.entries()) {
    if (s.joinPrev && i > 0) page++;
    else {
      doc++;
      page = 1;
    }
    labels.push(page > 1 ? `Doc ${doc} · page ${page}` : `Doc ${doc}`);
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-neutral-50 text-neutral-900">
      <div className="border-b bg-white px-4 pb-3" style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}>
        <h2 className="text-lg font-bold">Check your scans</h2>
        <p className="mt-0.5 text-sm text-neutral-600">
          {shots.length} scan{shots.length === 1 ? "" : "s"}, {docs} document{docs === 1 ? "" : "s"}. Tap “Page of previous” when a scan is the next page of the one before it.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {shots.length === 0 ? (
          <p className="mt-8 text-center text-sm text-neutral-500">No scans yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {shots.map((s, i) => {
              const isPage = s.joinPrev && i > 0;
              return (
                <div key={s.id} className={`rounded-xl border bg-white p-2 shadow-sm ${isPage ? "border-dashed" : ""}`}>
                  <div className="relative aspect-[3/4] overflow-hidden rounded-lg border bg-neutral-100">
                    {s.mediaType === "application/pdf" ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs text-neutral-500">
                        <DocumentIcon className="h-6 w-6" />
                        PDF
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.dataUrl} alt={`Scan ${i + 1}`} className="h-full w-full object-cover" />
                    )}
                    <span className="absolute bottom-1.5 left-1.5 rounded-full bg-neutral-900/75 px-2 py-0.5 text-[11px] font-medium text-white">
                      {labels[i]}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-1">
                    {i > 0 ? (
                      <label className="flex items-center gap-1.5 text-xs text-neutral-700">
                        <input
                          type="checkbox"
                          checked={s.joinPrev}
                          onChange={(e) => onChange(shots.map((x) => (x.id === s.id ? { ...x, joinPrev: e.target.checked } : x)))}
                        />
                        Page of previous
                      </label>
                    ) : (
                      <span />
                    )}
                    <button
                      type="button"
                      onClick={() => onChange(removeShot(shots, s.id))}
                      className="text-xs font-medium text-neutral-600"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex gap-2 border-t bg-white p-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
        <button type="button" onClick={onKeepScanning} className="flex-1 rounded-lg border px-4 py-3 text-sm font-medium text-neutral-700">
          Keep scanning
        </button>
        <button
          type="button"
          onClick={onAccept}
          disabled={!shots.length}
          className="flex-1 rounded-lg bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          Read {docs || ""} document{docs === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}
