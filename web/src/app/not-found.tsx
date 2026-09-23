import Link from "next/link";

// Reached by a mistyped address, an old link off a flyer, or a page that has
// moved. It must read sensibly whether or not there is an account behind it:
// offering "the dashboard" to a stranger who has never signed in is a dead end
// dressed as a way out.
export default function NotFound() {
  return (
    <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
      <h1 className="text-2xl font-bold">That page isn&apos;t here</h1>
      <p className="mt-1 text-neutral-600">
        The address may be mistyped, or the page may have moved. Nothing of yours has gone anywhere.
      </p>
      <Link href="/" className="mt-4 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
        Back to the start
      </Link>
    </div>
  );
}
