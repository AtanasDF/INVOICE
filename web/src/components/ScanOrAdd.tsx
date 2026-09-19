import Link from "next/link";
import { CameraIcon } from "@/components/icons";

// The camera is the main way in; typing it in by hand sits underneath.
export default function ScanOrAdd({ scanHref, scanLabel, addHref }: { scanHref: string; scanLabel: string; addHref: string }) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      <Link href={scanHref} className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white">
        <CameraIcon className="h-5 w-5" />
        {scanLabel}
      </Link>
      <Link href={addHref} className="text-sm font-medium text-neutral-600">
        + Add manually
      </Link>
    </div>
  );
}
