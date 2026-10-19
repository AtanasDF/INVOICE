"use client";

import { useEffect } from "react";

// A customer's link whose page couldn't be read just now. Not the app's own
// error page, which promises "your invoices and receipts are saved" and
// offers a dashboard to somebody who has no account; and not "this link
// isn't working", which is false -- the link is fine and will work again.
export default function PublicLinkError({ error, what }: { error: Error & { digest?: string }; what: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <h1 className="text-2xl font-bold">This {what} couldn&apos;t be loaded just now</h1>
        <p className="mt-2 text-neutral-600">The link is fine. Try again in a minute.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          Try again
        </button>
        {error.digest && <p className="mt-3 text-xs text-neutral-500">Reference {error.digest}</p>}
      </div>
    </div>
  );
}
