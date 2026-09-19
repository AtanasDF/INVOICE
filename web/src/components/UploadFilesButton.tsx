"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadIcon } from "@/components/icons";
import { ScanHandoff, readUpload, stashUploads } from "@/lib/scanHandoff";

// Under a camera button: photos or PDFs already on the phone, straight to
// the page that reads them (href), or to this page's own reader (onFiles).
export default function UploadFilesButton({
  href,
  onFiles,
  multiple = true,
  className = "",
  buttonClassName = "inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-neutral-900 shadow-sm",
  label,
  disabled = false,
}: {
  href?: string;
  onFiles?: (files: ScanHandoff[], failed: number) => void;
  multiple?: boolean;
  className?: string;
  buttonClassName?: string;
  label?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Big photos take seconds to read; a page left meanwhile mustn't be
  // pulled back to the reader.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setError(null);
    const read = await Promise.allSettled(files.map(readUpload));
    if (!mountedRef.current) return;
    const ok = read.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (!ok.length) {
      setBusy(false);
      setError(files.length === 1 ? "Couldn't read that file." : "Couldn't read those files.");
      return;
    }
    if (onFiles) {
      setBusy(false);
      onFiles(ok, files.length - ok.length);
      return;
    }
    router.push(stashUploads(ok, href ?? "/scan", files.length - ok.length));
  }

  return (
    <div className={className}>
      <label aria-disabled={busy || disabled} className={`cursor-pointer aria-disabled:cursor-default aria-disabled:opacity-50 ${buttonClassName}`}>
        <UploadIcon className="h-4 w-4" />
        {busy ? "Reading files…" : label ?? (multiple ? "Upload from files" : "Upload a file")}
        <input type="file" accept="image/*,application/pdf" multiple={multiple} className="hidden" onChange={onChange} disabled={busy || disabled} />
      </label>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
