import Link from "next/link";
import type { Metadata } from "next";
import StartFree from "@/components/site/StartFree";

// "What's the catch?" answered before it is asked. Free is said plainly and
// never "for ever": taking a free tier away later is the most hated thing in
// this market, so nothing here promises it can't happen.
export const metadata: Metadata = {
  title: "Free: what it includes",
  description: "Every part of the app, free, with no card. What the scanning allowance is, and what happens to your records.",
  alternates: { canonical: "/pricing" },
};

const LI = "flex gap-2 before:mt-2.5 before:size-1.5 before:shrink-0 before:rounded-full before:bg-neutral-400";

export default function Pricing() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 py-6">
      <header>
        <h1 className="text-[2rem] font-bold leading-tight sm:text-5xl">Free.</h1>
        <p className="mt-4 text-lg text-neutral-700">Every part of the app, with no card and no trial that runs out.</p>
      </header>

      <section className="rounded-xl border bg-white p-6 text-neutral-900 shadow-sm">
        <p className="text-4xl font-bold">£0</p>
        <p className="mt-1 text-neutral-600">a month</p>
        <ul className="mt-5 space-y-2 text-base text-neutral-800">
          <li className={LI}>Unlimited invoices, quotes and customers</li>
          <li className={LI}>Payment reminders sent for you</li>
          <li className={LI}>Receipts and bills read from a photo</li>
          <li className={LI}>Mileage, expenses, VAT and CIS</li>
          <li className={LI}>Your tax year by category, ready for your accountant</li>
          <li className={LI}>Everything downloadable as a spreadsheet</li>
        </ul>
        <div className="mt-6"><StartFree line="Sign up with your email. It takes about a minute." /></div>
      </section>

      <section>
        <h2 className="text-xl font-bold">How much scanning?</h2>
        <p className="mt-3 text-neutral-800">
          Reading a photo costs us something each time, so there is an allowance. In your first week you can scan up to <strong>300 documents a day</strong>,
          enough to catch up on a shoebox of old receipts. After that it&apos;s <strong>50 a day and 600 a month</strong>. Typing a receipt in yourself, and
          everything else in the app, has no limit.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold">Your records stay yours</h2>
        <p className="mt-3 text-neutral-800">
          You can download your invoices, receipts and customers as a spreadsheet whenever you like, and take them anywhere. If we ever add a paid plan,
          you&apos;ll hear it from us first.
        </p>
        <p className="mt-3 text-sm text-neutral-600">
          More questions? <Link href="/faq" className="font-medium underline">Read the answers</Link>.
        </p>
      </section>
    </div>
  );
}
