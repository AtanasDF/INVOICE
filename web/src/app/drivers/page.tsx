import Link from "next/link";
import type { Metadata } from "next";
import PhoneShot from "@/components/site/PhoneShot";
import StartFree from "@/components/site/StartFree";

// Where the depot flyers land (notes/promotion.md): a self-employed driver
// with a glovebox of fuel and parking receipts, reading on a phone in a
// depot. Short, their words, and the install steps one tap away. The flyer's
// own code (?from=...) is kept on any page, so nothing here handles it.
export const metadata: Metadata = {
  title: "For self-employed drivers",
  description: "Photograph fuel and parking receipts, log your miles at 45p, invoice the depot every week and have your tax year sorted. Free.",
  alternates: { canonical: "/drivers" },
};

const STEP = "flex gap-4";
const NUM = "flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm font-bold text-white";

export default function Drivers() {
  return (
    <div className="mx-auto max-w-5xl space-y-12 py-6">
      <section className="grid items-center gap-8 md:grid-cols-2">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">For self-employed drivers</p>
          <h1 className="mt-2 text-[2rem] font-bold leading-tight sm:text-5xl">Your glovebox, sorted.</h1>
          <p className="mt-4 text-lg text-neutral-700">
            Fuel, parking, repairs and miles, kept for your Self Assessment without a carrier bag of receipts. And your invoices to the depot, chased for you.
          </p>
          <div className="mt-6"><StartFree /></div>
        </div>
        <PhoneShot src="/site/receipts.webp" alt="Fuel, parking and repair receipts saved in the app." />
      </section>

      <section>
        <h2 className="text-2xl font-bold">What it does for a driver</h2>
        <ol className="mt-6 space-y-6">
          <li className={STEP}>
            <span aria-hidden="true" className={NUM}>1</span>
            <div><p className="text-lg font-semibold">Photograph the receipt at the pump</p><p className="mt-1 text-neutral-700">It reads the total and the VAT. A whole week&apos;s worth in one go, if that&apos;s how you do it.</p></div>
          </li>
          <li className={STEP}>
            <span aria-hidden="true" className={NUM}>2</span>
            <div><p className="text-lg font-semibold">Log your miles</p><p className="mt-1 text-neutral-700">From and to, and it works out the claim at HMRC&apos;s rate: 45p a mile for the first 10,000, then 25p.</p></div>
          </li>
          <li className={STEP}>
            <span aria-hidden="true" className={NUM}>3</span>
            <div><p className="text-lg font-semibold">Invoice the depot every week</p><p className="mt-1 text-neutral-700">Same again copies your last invoice to them, dated today. If it isn&apos;t paid, reminders go out for you.</p></div>
          </li>
          <li className={STEP}>
            <span aria-hidden="true" className={NUM}>4</span>
            <div><p className="text-lg font-semibold">Self Assessment, without the shoebox</p><p className="mt-1 text-neutral-700">Everything adds up by category for the tax year. Print it for your accountant, or fill in the return yourself.</p></div>
          </li>
        </ol>
      </section>

      <section className="rounded-xl border bg-white p-6 text-neutral-900 shadow-sm">
        <h2 className="text-xl font-bold">Put it on your phone</h2>
        <p className="mt-2 text-neutral-700">No app store. Make your account, then add it to your home screen and it opens like any other app.</p>
        <Link href="/help/home-screen" className="mt-4 inline-block rounded-lg border px-4 py-3 text-base font-medium text-neutral-800">Show me how, step by step</Link>
      </section>

      <footer className="space-y-4">
        <StartFree />
        <p className="text-sm text-neutral-600">
          <Link href="/features" className="font-medium underline">Everything it does</Link> · <Link href="/faq" className="font-medium underline">Questions</Link>
        </p>
      </footer>
    </div>
  );
}
