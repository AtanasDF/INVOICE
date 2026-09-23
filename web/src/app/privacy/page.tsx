import Link from "next/link";
import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/siteName";

export const metadata: Metadata = {
  title: `Privacy — ${SITE_NAME}`,
  description: "What we keep, why, who else sees it, and how to get it back or get rid of it.",
};

// Plain words, because the people this is written for are not lawyers and the
// ones who read it are usually worried about something specific. Everything
// here has to stay true of the app as it actually is -- if a supplier changes,
// this page changes in the same commit.
const H = "mt-8 text-lg font-bold";
const P = "mt-3 text-neutral-800";
const LI = "mt-2 text-neutral-800";

export default function Privacy() {
  return (
    <div className="mx-auto max-w-2xl py-4">
      <h1 className="text-2xl font-bold">Your information</h1>
      <p className="mt-1 text-neutral-600">What we keep, why, and who else sees it. In plain words.</p>

      <h2 className={H}>The short version</h2>
      <p className={P}>
        Your invoices, receipts and photographs are yours. We keep them so the app can show them back to you. We do not
        sell them, we do not advertise to you, and nobody here reads them for entertainment.
      </p>

      <h2 className={H}>What we keep</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li className={LI}>Your email address, so you can sign in and we can send you the app&apos;s own emails.</li>
        <li className={LI}>What you put in: invoices, quotes, customers, suppliers, expenses and your business details.</li>
        <li className={LI}>The photographs and files you scan or upload, and what was read from them.</li>
        <li className={LI}>If you arrived from a flyer, the short code on it — so we know which flyer worked. Nothing else about where you came from.</li>
      </ul>

      <h2 className={H}>Who else sees it</h2>
      <p className={P}>
        Only the companies that run the app for us, and only as much as they need to do their part:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li className={LI}><strong>Supabase</strong> stores your records and your files, and handles signing in.</li>
        <li className={LI}><strong>Vercel</strong> runs the website itself.</li>
        <li className={LI}><strong>Resend</strong> sends the emails — confirming your address, and any invoice or document you choose to email.</li>
        <li className={LI}>
          <strong>Google</strong> and <strong>Anthropic</strong> read the documents you scan. When you photograph a
          receipt, that picture is sent to one of them to be read, and what comes back is what fills in the form. They
          do not use it to train anything.
        </li>
      </ul>
      <p className={P}>
        We do not give your information to anyone else, unless the law makes us.
      </p>

      <h2 className={H}>How long we keep it</h2>
      <p className={P}>
        Your records stay until you delete them or close your account. Photographs may be tidied away after a time to
        keep the app affordable — if that happens you will be emailed a copy first, and the record itself (who, when,
        how much, how much VAT) stays.
      </p>

      <h2 className={H}>Getting it back, or getting rid of it</h2>
      <p className={P}>
        Everything you make here can be saved to your own device at any time, as a PDF, a picture, a Word file or a
        spreadsheet. If you want your account and everything in it deleted, ask through{" "}
        <Link href="/feedback" className="font-medium underline">Feedback</Link> and it will be done.
      </p>
      <p className={P}>
        You have the right to see what we hold, to correct it, to take it elsewhere, and to have it erased. If you think
        we have got something wrong you can complain to the Information Commissioner&apos;s Office at ico.org.uk.
      </p>

      <h2 className={H}>Cookies</h2>
      <p className={P}>
        There are none for advertising, and none that follow you around. The app stores a few things in your browser so
        it works: whether you are signed in, which colour you picked, and which panel you last had open.
      </p>

      <h2 className={H}>Asking us something</h2>
      <p className={P}>
        Use <Link href="/feedback" className="font-medium underline">Feedback</Link> in the app. It goes straight to the
        person who made it.
      </p>

      <p className="mt-10 text-sm text-neutral-500">Last changed 23 September 2026.</p>
    </div>
  );
}
