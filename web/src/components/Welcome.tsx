import Link from "next/link";

// What a stranger sees at the front door (notes/first-page-research.md,
// 2026-09-22): two things they can do, each in one line, nothing to join.
// Plain links, so they work before the page has finished loading; big
// type and big buttons, for Atanas's "three old kids should be able to do
// that". The picture the research describes ships separately.
export default function Welcome() {
  return (
    <div className="mx-auto max-w-xl py-6 sm:py-12">
      <h1 className="text-[2rem] font-bold leading-tight sm:text-4xl">Make an invoice. Check a company.</h1>
      <p className="mt-3 text-lg text-neutral-700">Both are free. Nothing to join. Nothing to pay.</p>

      <div className="mt-8 space-y-8">
        <div>
          <Link href="/free-invoice" className="flex min-h-16 w-full items-center justify-center rounded-xl bg-neutral-900 px-5 py-4 text-center text-xl font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900">
            Make an invoice
          </Link>
          <p className="mt-2 text-lg text-neutral-700">Say what you did and what it costs. Then print it or email it.</p>
        </div>
        <div>
          <Link href="/check-company" className="flex min-h-16 w-full items-center justify-center rounded-xl border-2 border-neutral-900 bg-white px-5 py-4 text-center text-xl font-bold text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900">
            Check a company
          </Link>
          <p className="mt-2 text-lg text-neutral-700">See if a company is real, still trading, and who runs it.</p>
          <p className="mt-1 text-base text-neutral-600">The facts come from Companies House.</p>
        </div>
      </div>

      <p className="mt-10 text-base text-neutral-600">We do not keep anything you type unless you ask us to.</p>
    </div>
  );
}
