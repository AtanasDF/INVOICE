"use client";

import { useState } from "react";
import type { CapturedFile } from "@/components/DocumentCapture";
import CaptureButton from "@/components/CaptureButton";
import { DocumentIcon } from "@/components/icons";

export const MAX_PAGES = 20;

export type Capture =
  | { kind: "first" }
  | { kind: "add" }
  | { kind: "retake"; index: number; failureMessage?: string };

function Thumb({ page, index, broken, disabled, onBroken, onRetake, onRetaken }: {
  page: CapturedFile;
  index: number;
  broken: boolean;
  disabled: boolean;
  onBroken: () => void;
  onRetake: () => void;
  onRetaken: (file: CapturedFile) => void;
}) {
  if (broken) {
    return (
      <div className="flex h-20 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-red-300 bg-red-50 text-xs text-red-600">
        <span>Page {index + 1}</span>
        <CaptureButton onOpen={onRetake} onCapture={onRetaken} disabled={disabled} className="font-medium underline disabled:opacity-50">
          Retake
        </CaptureButton>
      </div>
    );
  }
  return (
    <div className="relative h-20 w-16 shrink-0">
      {page.mediaType === "application/pdf" ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg border bg-neutral-50 text-xs text-neutral-500">
          <DocumentIcon className="h-5 w-5" />
          PDF
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={page.dataUrl} alt={`Page ${index + 1}`} onError={onBroken} className="h-full w-full rounded-lg border object-cover" />
      )}
      <span className="absolute bottom-1 left-1 rounded-full bg-neutral-900/70 px-1.5 text-[10px] font-medium text-white">{index + 1}</span>
    </div>
  );
}

export default function PagesStrip({ pages, scanning, onOpen, onCaptured, confirmStartNew }: {
  pages: CapturedFile[];
  scanning: boolean;
  onOpen: (capture: Capture) => void;
  onCaptured: (file: CapturedFile, capture: Capture) => void;
  confirmStartNew: () => boolean;
}) {
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const full = pages.length >= MAX_PAGES;

  return (
    <div>
      <label className="text-xs text-neutral-500">Pages</label>
      <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
        {pages.map((p, i) => (
          <Thumb
            key={`${i}-${p.dataUrl.length}`}
            page={p}
            index={i}
            broken={broken.has(p.dataUrl)}
            disabled={scanning}
            onBroken={() => setBroken((prev) => new Set(prev).add(p.dataUrl))}
            onRetake={() => onOpen({ kind: "retake", index: i })}
            onRetaken={(file) => onCaptured(file, { kind: "retake", index: i })}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <CaptureButton
          onOpen={() => onOpen({ kind: "add" })}
          onCapture={(file) => onCaptured(file, { kind: "add" })}
          disabled={scanning || full}
          className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50"
        >
          Add another page
        </CaptureButton>
        <CaptureButton
          beforeOpen={confirmStartNew}
          onOpen={() => onOpen({ kind: "first" })}
          onCapture={(file) => onCaptured(file, { kind: "first" })}
          disabled={scanning}
          className="inline-block min-h-11 px-2 py-2.5 text-sm font-medium text-neutral-600 disabled:opacity-50"
        >
          Start a new document
        </CaptureButton>
      </div>
      {full && <p className="mt-1 text-xs text-neutral-500">{MAX_PAGES} pages is the most one document can have.</p>}
      <p className="mt-1 text-xs text-neutral-500">
        {scanning
          ? `Reading ${pages.length} page${pages.length === 1 ? "" : "s"}…`
          : "Adding or retaking a page re-reads the whole document. Your edits are kept."}
      </p>
    </div>
  );
}
