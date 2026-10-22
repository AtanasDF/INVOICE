import Link from "next/link";

// The one thing every public page leads to.
export default function StartFree({ line = "Free. No card. Works on iPhone, Android and computers." }: { line?: string }) {
  return (
    <div className="space-y-2">
      <Link href="/login?new=1" className="inline-block rounded-lg bg-neutral-900 px-6 py-3.5 text-base font-bold text-white transition active:scale-95 motion-reduce:transition-none">
        Start free
      </Link>
      <p className="text-sm text-neutral-600">{line}</p>
    </div>
  );
}
