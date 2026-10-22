import Link from "next/link";
import type { Metadata } from "next";
import Feature from "@/components/site/Feature";
import StartFree from "@/components/site/StartFree";

// What the app does, one screen at a time, for somebody comparing it with
// whatever they use now. Every line is true today (notes/website-plan.md).
export const metadata: Metadata = {
  title: "What it does: invoices, receipts and mileage for the self-employed",
  description: "Send invoices that chase themselves, photograph receipts, log mileage at HMRC's rates and see your tax year in one place. Free, for UK sole traders and small companies.",
  alternates: { canonical: "/features" },
};

const LI = "flex gap-2 before:mt-2.5 before:size-1.5 before:shrink-0 before:rounded-full before:bg-neutral-400";

export default function Features() {
  return (
    <div className="mx-auto max-w-5xl space-y-16 py-6">
      <header className="max-w-2xl">
        <h1 className="text-[2rem] font-bold leading-tight sm:text-5xl">Everything a one-person business sends and keeps.</h1>
        <p className="mt-4 text-lg text-neutral-700">
          Invoices out, receipts in, miles driven, and what it all adds up to for the tax year. On your phone, where the paper is.
        </p>
        <div className="mt-6"><StartFree /></div>
      </header>

      <Feature title="Invoices that chase themselves" shot="/site/pay-now.webp" alt="An invoice with a Pay with SumUp button, bank details and the reminder dates.">
        <p>Send an invoice by email or a private link. Polite reminders go out for you before and after it&apos;s due, and stop the moment it&apos;s paid.</p>
        <ul className="space-y-1.5 text-base">
          <li className={LI}>You see when your customer opens it.</li>
          <li className={LI}>Add your SumUp, Stripe, PayPal or bank app link and they get a Pay button.</li>
          <li className={LI}>Same again: your last invoice to that customer, dated today, in one tap.</li>
        </ul>
      </Feature>

      <Feature flip title="Photograph a receipt. It reads itself." shot="/site/receipts.webp" alt="A list of receipts: fuel, parking and repairs, each with its date and amount.">
        <p>Point the camera at a receipt or a bill. The shop, the date, the total and the VAT are read for you, and you check them before anything is saved.</p>
        <ul className="space-y-1.5 text-base">
          <li className={LI}>A whole pile in one go: it takes the next one when the page is still.</li>
          <li className={LI}>Or forward bills from your email to your own import address.</li>
          <li className={LI}>Bills you still have to pay are kept apart, with their due dates.</li>
        </ul>
      </Feature>

      <Feature title="Quotes that turn into invoices" shot="/site/invoices.webp" alt="The invoices list with a Quotes tab beside it.">
        <p>Send a quote, and your customer accepts it from a link. When the job&apos;s done it becomes the invoice without typing it again, deposit and all.</p>
      </Feature>

      <Feature flip title="Mileage at HMRC's rates" shot="/site/mileage.webp" alt="The mileage page: date, vehicle, from and to, and the miles claimed this tax year.">
        <p>Put in where you drove from and to. The miles are worked out, and the claim is 45p a mile for the first 10,000 in the tax year, then 25p. No receipt needed.</p>
      </Feature>

      <Feature title="Know what you're owed, and what you've spent" shot="/site/home.webp" alt="The home screen: an overdue invoice to check, and big buttons to scan, send an invoice or send a quote.">
        <p>Open the app and it tells you who is late paying, which bills are due, and what to do next. Nothing to dig for.</p>
      </Feature>

      <Feature flip title="Your tax year in one place" shot="/site/tax.webp" alt="Expenses for the month: totals with and without VAT, and a chart by category.">
        <p>Every expense lands in its category, by month and by tax year, with the VAT figures if you&apos;re registered. Print it or save it as a PDF for your accountant.</p>
        <p className="text-base text-neutral-600">It keeps your records and shows your figures. It doesn&apos;t send your tax return.</p>
      </Feature>

      <section className="rounded-xl border bg-white p-6 text-neutral-900 shadow-sm">
        <h2 className="text-xl font-bold">And the small things that save an evening</h2>
        <ul className="mt-4 grid gap-3 text-base text-neutral-700 sm:grid-cols-2">
          <li className={LI}>Bring your customers in from Excel, a CSV from your old app, or your phone&apos;s contacts.</li>
          <li className={LI}>Set up in one go from a photo of an invoice you&apos;ve already sent.</li>
          <li className={LI}>Check a company at Companies House before you quote.</li>
          <li className={LI}>Turn photos of any paper into one PDF to send.</li>
          <li className={LI}>VAT registered or in CIS? Both are built in, and stay out of the way if you&apos;re not.</li>
          <li className={LI}>Download everything as a spreadsheet, whenever you like.</li>
        </ul>
      </section>

      <footer className="space-y-4">
        <StartFree />
        <p className="text-sm text-neutral-600">
          Questions first? <Link href="/faq" className="font-medium underline">Read the answers</Link>, or see <Link href="/pricing" className="font-medium underline">what free includes</Link>.
        </p>
      </footer>
    </div>
  );
}
