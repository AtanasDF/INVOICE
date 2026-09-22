"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CameraIcon } from "@/components/icons";
import UploadFilesButton from "@/components/UploadFilesButton";
import { SAFARI_CAMERA_TIP, cameraPermission } from "@/lib/camera";
import { useIsIOS } from "@/lib/platform";

export type AddChoice = { href: string; label: string; hint?: string };

const STANDARD = ["/scan", "/receipts/new", "/invoices/new", "/quotes/new"];

// One Add button for everything a page can start: the scanner first
// (it works out which kind of document it is), then the by-hand routes.
// `also` holds a page's own ways in; one that already appears below is
// dropped rather than listed twice.
export default function AddAnything({ also = [], label = "Add" }: { also?: AddChoice[]; label?: string }) {
  const router = useRouter();
  const isIOS = useIsIOS();
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!open) return;
    cameraPermission().then((state) => setBlocked(state === "denied"));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // The scan pages prefetch nothing heavy, but the camera screen loads
  // OpenCV -- warming it while the sheet is open makes the tap instant.
  useEffect(() => {
    if (open) router.prefetch("/scan");
  }, [open, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white"
      >
        + {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/40" />
          <div
            role="dialog"
            aria-label="Add"
            className="relative w-full max-w-sm rounded-t-2xl border bg-white p-4 text-left text-neutral-900 shadow-lg sm:rounded-2xl"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            <p className="text-xs text-neutral-500">What are you adding?</p>
            <div className="mt-2 space-y-1">
              <Link
                href="/scan"
                onClick={() => setOpen(false)}
                className="flex items-start gap-3 rounded-lg border px-3 py-2.5 hover:bg-neutral-50"
              >
                <CameraIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <span>
                  <span className="block text-sm font-medium">Scan it</span>
                  <span className="block text-xs text-neutral-500">
                    A receipt, a supplier invoice or a credit note — the scanner works out which, and reads several in a row.
                  </span>
                </span>
              </Link>
              {blocked && (
                <p className="px-3 text-xs text-amber-700">
                  The camera is blocked for this site, so scanning opens onto nothing. {isIOS ? SAFARI_CAMERA_TIP : "Allow it in your browser's site settings, or upload a photo or PDF below."}
                </p>
              )}
              <UploadFilesButton
                href="/scan"
                label="Upload a photo or PDF"
                className="block"
                buttonClassName="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-neutral-50"
              />
              {also
                .filter((c) => !STANDARD.includes(c.href))
                .map((c) => (
                  <Choice key={c.href} choice={c} onPick={() => setOpen(false)} />
                ))}
              <Choice choice={{ href: "/receipts/new", label: "Add a receipt by hand", hint: "Nothing to photograph — type the total in" }} onPick={() => setOpen(false)} />
              <Choice choice={{ href: "/invoices/new", label: "Make an invoice", hint: "Bill a customer for work you've done" }} onPick={() => setOpen(false)} />
              <Choice choice={{ href: "/quotes/new", label: "Make a quote", hint: "Price a job before you do it" }} onPick={() => setOpen(false)} />
              <Choice choice={{ href: "/clients/new", label: "Add a client or supplier", hint: "Someone you work for, or buy from" }} onPick={() => setOpen(false)} />
              <Choice choice={{ href: "/copy", label: "Copy a document", hint: "Photograph any paper into one file to save or send" }} onPick={() => setOpen(false)} />
            </div>
            <button type="button" onClick={() => setOpen(false)} className="mt-3 w-full rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Choice({ choice, onPick }: { choice: AddChoice; onPick: () => void }) {
  return (
    <Link href={choice.href} onClick={onPick} className="block rounded-lg border px-3 py-2.5 hover:bg-neutral-50">
      <span className="block text-sm font-medium">{choice.label}</span>
      {choice.hint && <span className="block text-xs text-neutral-500">{choice.hint}</span>}
    </Link>
  );
}
