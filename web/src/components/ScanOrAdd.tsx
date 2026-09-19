import Link from "next/link";
import { CameraIcon } from "@/components/icons";
import UploadFilesButton from "@/components/UploadFilesButton";

// The camera is the main way in, photos or PDFs already on the phone next,
// and typing it in by hand underneath.
export default function ScanOrAdd({ scanHref, scanLabel, addHref }: { scanHref: string; scanLabel: string; addHref: string }) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      <Link href={scanHref} className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white">
        <CameraIcon className="h-5 w-5" />
        {scanLabel}
      </Link>
      {/* The scan page reads several documents in one go; copying an invoice
          or filling in a client takes one. */}
      <UploadFilesButton href={scanHref} multiple={scanHref.startsWith("/scan")} />
      <Link href={addHref} className="text-sm font-medium text-neutral-600">
        + Add manually
      </Link>
    </div>
  );
}
