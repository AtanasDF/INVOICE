import Link from "next/link";
import type { Metadata } from "next";
import StartFree from "@/components/site/StartFree";

// The doubts people have before handing over an email address. Each answer
// has to stay true; where the full story is on another page, it links there
// rather than saying it twice.
export const metadata: Metadata = {
  title: "Questions and answers",
  description: "Is it free, where is my data kept, does it do my tax return, does it work on iPhone, can I take my records with me.",
  alternates: { canonical: "/faq" },
};

const QUESTIONS: [string, React.ReactNode][] = [
  ["Is it really free?", <>Yes, all of it, with no card. Scanning photos has a generous daily allowance; everything else has no limit. <Link href="/pricing" className="underline">What free includes</Link>.</>],
  ["Do I need to download anything?", <>No. It runs in your phone&apos;s browser, and you can add it to your home screen so it opens like an app. <Link href="/help/home-screen" className="underline">How to do that</Link>.</>],
  ["Does it do my tax return?", <>No. It keeps your records and adds them up by category for the tax year, so filling in your Self Assessment, or handing it to your accountant, is quick. It doesn&apos;t send anything to HMRC.</>],
  ["Where is my data kept?", <>Your records and files are stored in Frankfurt, Germany. When you have a photo read for you, the picture is sent to Google (sometimes Anthropic) in the United States to be read, and isn&apos;t used to train anything. Typing a receipt in yourself keeps it all in Germany. <Link href="/privacy" className="underline">The full detail</Link>.</>],
  ["Can my accountant use it?", <>Print or save your expenses and VAT figures as a PDF, or download everything as a spreadsheet, and send it to them.</>],
  ["I'm VAT registered, or work under CIS.", <>Both are built in: VAT on every line and the figures for each quarter, and CIS deductions on your invoices. If they don&apos;t apply to you, you won&apos;t see them.</>],
  ["What if I lose my phone?", <>Your records are in your account, not on the phone. Sign in on a new one and everything is there.</>],
  ["Can I leave and take my records with me?", <>Yes. Download your invoices, receipts and customers as spreadsheets at any time, from inside the app.</>],
  ["My customers are in another app or a spreadsheet.", <>Bring them in from Excel, a CSV your old app exports, or your phone&apos;s contacts. You see the list before anything is added.</>],
];

export default function Faq() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 py-6">
      <header>
        <h1 className="text-[2rem] font-bold leading-tight sm:text-5xl">Questions</h1>
        <p className="mt-4 text-lg text-neutral-700">The things people ask before they start.</p>
      </header>
      <div className="space-y-3">
        {QUESTIONS.map(([q, a]) => (
          <details key={q} className="group rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
            <summary className="cursor-pointer list-none text-lg font-semibold marker:hidden">
              <span className="flex items-start justify-between gap-4">
                {q}
                <span aria-hidden="true" className="text-neutral-500 transition group-open:rotate-45 motion-reduce:transition-none">+</span>
              </span>
            </summary>
            <p className="mt-3 text-neutral-700">{a}</p>
          </details>
        ))}
      </div>
      <p className="text-neutral-700">
        {/* No contact address yet: every address at the domain goes to the
            receipt importer, so one made up here would bounce. */}
        Something else? Once you&apos;re in, Feedback in the app goes straight to the person who makes it, and you get a reply.
      </p>
      <StartFree />
    </div>
  );
}
