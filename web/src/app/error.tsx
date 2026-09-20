"use client";

import Link from "next/link";
import { useEffect } from "react";

// The last line of defence: whatever broke, nothing here is lost -- the
// records are in the database, not on the screen -- and one tap re-renders
// the page rather than leaving him on a dead white screen.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
      <h1 className="text-2xl font-bold">Something went wrong on this page</h1>
      <p className="mt-1 text-neutral-600">
        Nothing has been lost — your invoices and receipts are saved. Try the page again, or go back to the dashboard.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={reset} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          Try again
        </button>
        <Link href="/" className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
          Dashboard
        </Link>
      </div>
      {error.digest && <p className="mt-3 text-xs text-neutral-500">Reference {error.digest}</p>}
    </div>
  );
}
