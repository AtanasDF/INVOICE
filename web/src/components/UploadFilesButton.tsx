"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadIcon } from "@/components/icons";
import { readUpload, stashUploads } from "@/lib/scanHandoff";

// Under a camera button: photos or PDFs already on the phone, straight to
// the page that reads them.
export default function UploadFilesButton({
  href,
  multiple = true,
  className = "",
  buttonClassName = "inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-neutral-900 shadow-sm",
  label,
}: {
  href: string;
  multiple?: boolean;
  className?: string;
  buttonClassName?: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setError(null);
    const read = await Promise.allSettled(files.map(readUpload));
    const ok = read.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (!ok.length) {
      setBusy(false);
      setError(files.length === 1 ? "Couldn't read that file." : "Couldn't read those files.");
      return;
    }
    stashUploads(ok);
    router.push(href);
  }

  return (
    <div className={className}>
      <label aria-disabled={busy} className={`cursor-pointer ${buttonClassName}`}>
        <UploadIcon className="h-4 w-4" />
        {busy ? "Reading files…" : label ?? (multiple ? "Upload from files" : "Upload a file")}
        <input type="file" accept="image/*,application/pdf" multiple={multiple} className="hidden" onChange={onChange} disabled={busy} />
      </label>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
