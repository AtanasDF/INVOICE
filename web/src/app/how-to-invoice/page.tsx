import Link from "next/link";
import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/siteName";

// The one public page that can be found by someone who does not know the app
// exists (notes/run-order.md item 12). Ranking for "free invoice template UK"
// needs a page a stranger can actually use, and since nothing works before an
// account the only honest version of that is a page that ANSWERS the question
// rather than pretending to be a tool. It ends at the sign-up, and the rule
// that nothing works before an account is untouched.
//
// Everything here has to stay true. It is written for a sole trader or a
// one-person limited company in the UK, and it says plainly where the line is
// between "this is what an invoice needs" and "ask an accountant".
export const metadata: Metadata = {
  title: "How to invoice when you're self-employed (UK) — free invoice guide",
  description:
    "What a UK invoice must show, how to number them, what to do about VAT and CIS, and how to get paid on time. Plain English, for sole traders and small limited companies.",
  alternates: { canonical: "/how-to-invoice" },
  openGraph: {
    type: "article",
    url: "/how-to-invoice",
    title: "How to invoice when you're self-employed (UK)",
    description: "What a UK invoice must show, how to number them, VAT, CIS, and getting paid on time.",
  },
};

const H2 = "mt-10 text-xl font-bold";
const H3 = "mt-6 text-lg font-semibold";
const P = "mt-3 text-neutral-800";
const LI = "mt-2 text-neutral-800";

export default function HowToInvoice() {
  return (
    <article className="mx-auto max-w-2xl py-4">
      <h1 className="text-[1.9rem] font-bold leading-tight sm:text-4xl">How to invoice when you&apos;re self-employed</h1>
      <p className="mt-3 text-lg text-neutral-700">
        What a UK invoice has to show, how to number them, what changes if you&apos;re VAT registered or in
        construction, and how to actually get paid. No jargon.
      </p>

      <h2 className={H2}>What has to be on it</h2>
      <p className={P}>
        An invoice is a request for money with enough detail that both of you, and HMRC, can tell later what it was
        for. For a sole trader that means:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li className={LI}>The word <strong>invoice</strong>, so nobody mistakes it for a quote or a receipt.</li>
        <li className={LI}><strong>Your name and address</strong> — your own name if you trade under it, plus any trading name.</li>
        <li className={LI}><strong>Who it&apos;s for</strong>: the customer&apos;s name and address.</li>
        <li className={LI}>A <strong>unique invoice number</strong> that carries on from the last one.</li>
        <li className={LI}>The <strong>date</strong> you&apos;re sending it, and the date of the work if that&apos;s different.</li>
        <li className={LI}>A <strong>description</strong> of what you did, and the amount for each part.</li>
        <li className={LI}>The <strong>total owed</strong>, and when you want it by.</li>
        <li className={LI}><strong>How to pay you</strong> — sort code and account number, usually.</li>
      </ul>
      <p className={P}>
        A limited company also has to give its registered company name, its company number, and the address registered
        at Companies House.
      </p>

      <h2 className={H2}>Numbering: the bit people get wrong</h2>
      <p className={P}>
        Invoice numbers must be unique and shouldn&apos;t have gaps. Not because anyone is checking every week, but
        because a gap is the first thing that gets asked about if your books are ever looked at, and &ldquo;I deleted
        one&rdquo; is a bad answer.
      </p>
      <p className={P}>
        <strong>Never reuse a number, and never renumber an old invoice.</strong> If you send one by mistake, don&apos;t
        delete it — raise a credit note against it. The pair of documents tells the true story; a hole in the sequence
        doesn&apos;t.
      </p>

      <h2 className={H2}>VAT</h2>
      <p className={P}>
        You only charge VAT if you&apos;re VAT registered. Registration is compulsory once your turnover passes the
        threshold, and optional below it — worth it if you mostly invoice VAT-registered businesses, usually not if you
        invoice the public. The current threshold is on GOV.UK; it moves.
      </p>
      <p className={P}>If you are registered, the invoice also needs:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li className={LI}>Your <strong>VAT number</strong>.</li>
        <li className={LI}>The <strong>rate</strong> on each line — most things are 20%, some are 5%, some are zero-rated.</li>
        <li className={LI}>The <strong>amount before VAT</strong>, the <strong>VAT</strong>, and the <strong>total</strong>, shown separately.</li>
      </ul>
      <p className={P}>
        Zero-rated and exempt are not the same thing, and it matters for what you can claim back. If a lot of your work
        is one of those, that&apos;s a conversation with an accountant, not a web page.
      </p>

      <h2 className={H2}>If you&apos;re in construction: CIS</h2>
      <p className={P}>
        Under the Construction Industry Scheme, the contractor you invoice keeps back a slice of your <em>labour</em>
        and pays it to HMRC against your tax bill. Usually 20% if you&apos;re registered, 30% if you&apos;re not.
      </p>
      <p className={P}>
        <strong>Materials are not deducted from.</strong> So split labour and materials on the invoice — if you lump
        them together, the deduction comes off the lot and you&apos;re short. The money isn&apos;t lost; it&apos;s
        already paid towards your tax, and you claim it back at the end of the year. Keep every statement.
      </p>

      <h2 className={H2}>Getting paid</h2>
      <h3 className={H3}>Say when</h3>
      <p className={P}>
        &ldquo;Payment within 30 days&rdquo; on the invoice is worth more than any chasing afterwards. With no terms
        agreed, the law&apos;s default for business-to-business work is 30 days.
      </p>
      <h3 className={H3}>Chase early and plainly</h3>
      <p className={P}>
        Most late payment isn&apos;t refusal — it&apos;s an invoice sitting in someone&apos;s inbox. A short message a
        few days before it&apos;s due does more than an angry one a month after.
      </p>
      <h3 className={H3}>You can charge interest</h3>
      <p className={P}>
        On a late business-to-business invoice you&apos;re entitled to statutory interest and a fixed sum towards the
        cost of chasing. Mentioning that you&apos;re entitled to it usually works better than charging it.
      </p>

      <h2 className={H2}>Keep the paper</h2>
      <p className={P}>
        Keep your invoices and your receipts. HMRC expects records to be kept for several years, and the receipt for a
        drill you bought in March is what turns it into a cost rather than a guess. Photograph them as you go — a
        glovebox full of faded till receipts in January is a bad evening.
      </p>

      <div className="mt-12 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <h2 className="text-lg font-bold">Doing all this by hand is the slow way</h2>
        <p className="mt-2 text-neutral-700">
          {SITE_NAME} numbers your invoices for you so the sequence never gaps, does the VAT and the CIS split, and
          reads your receipts off a photograph. Free, and it takes a minute to start.
        </p>
        <Link href="/" className="mt-4 inline-block rounded-lg bg-neutral-900 px-4 py-3 text-base font-bold text-white">
          Make an account
        </Link>
      </div>

      <p className="mt-10 text-sm text-neutral-500">
        Written to be useful, not to be advice: it&apos;s general information about invoicing in the UK, and it
        isn&apos;t tax advice. Thresholds and rates change — check GOV.UK, and check anything that matters with an
        accountant. Last reviewed 23 September 2026.
      </p>
    </article>
  );
}
