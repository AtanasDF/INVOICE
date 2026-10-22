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
        <li className={LI}>How many documents you have had read each day and each month, so the daily limit can be kept.</li>
        <li className={LI}>If you arrived from a flyer, the short code on it — so we know which flyer worked. Nothing else about where you came from.</li>
        <li className={LI}>
          If you ask the help chat a question, the question itself — so we can see what the app failed to explain and
          explain it properly. What the chat answered is not kept. Don&apos;t type anything into it you would rather we
          did not read.
        </li>
        <li className={LI}>
          If the app breaks, what broke and which page you were on — so it can be fixed. Not what was on your screen,
          not what you had typed, and not who you are. A private link you were looking at is stripped out of the report
          before it is sent.
        </li>
      </ul>

      <h2 className={H}>Who else sees it</h2>
      <p className={P}>
        Only the companies that run the app for us, and only as much as they need to do their part:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li className={LI}><strong>Supabase</strong> stores your records and your files, and handles signing in.</li>
        <li className={LI}><strong>Vercel</strong> runs the website itself.</li>
        {process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === "on" && (
          <li className={LI}><strong>Google</strong>, only if you choose to sign in with Google: it tells us your email address and
            name. We never see your Google password or anything else in your Google account.</li>
        )}
        <li className={LI}><strong>Resend</strong> sends the emails — confirming your address, any invoice or document you choose to email,
          and the payment reminders to your customers if you leave them switched on.</li>
        <li className={LI}>
          <strong>Cloudflare</strong> runs the check that you are a person when you sign in, and receives any receipt you
          email in to your own import address before passing it to us.
        </li>
        <li className={LI}>
          <strong>Google</strong> reads the documents you scan. When you photograph a receipt, that picture is sent to
          be read, and what comes back is what fills in the form. It is not used to train anything.{" "}
          <strong>Anthropic</strong> reads them instead when Google is too slow or busy to answer, so the reading still
          works. Anthropic also reads a business card or letterhead you photograph to add a contact, and an invoice you
          describe in your own words. It is not used to train anything either.
        </li>
      </ul>
      <p className={P}>
        Some boxes look things up as you type. An address is looked up with postcodes.io and OpenStreetMap, a company
        with Companies House, and a VAT number with HMRC where that check is turned on. They are sent what is in the box, and nothing else about you.
      </p>
      <p className={P}>
        We do not give your information to anyone else, unless the law makes us.
      </p>

      <h2 className={H}>Where it is kept</h2>
      <p className={P}>
        Your records, your files and the app itself are in <strong>Frankfurt, Germany</strong> — inside the European
        Economic Area. Nothing about your account is stored outside it.
      </p>
      <p className={P}>
        The one thing that leaves is a document you have read for you: the picture is sent to Google in the{" "}
        <strong>United States</strong> to be read, and what comes back fills in the form. The picture itself stays with
        us; they are not given your account, your name, or anything else you have here, and they do not use it to train
        anything. Google is certified under the UK-US Data Bridge, which is the arrangement that makes that transfer
        lawful. If you would rather nothing left the EEA, type your receipts in by hand — every screen that takes a scan
        also takes typing.
      </p>
      <p className={P}>
        When Anthropic reads it instead — because Google was too slow or busy, or because it is a business card, a
        letterhead or an invoice described in words — it goes to the <strong>United States</strong> as well. Anthropic
        is not certified under the UK-US Data Bridge, so that transfer rests on the contract terms we have with them
        rather than on that arrangement. Typing it in by hand avoids this too.
      </p>

      <h2 className={H}>Why we are allowed to keep it</h2>
      <p className={P}>
        Because you asked us to. Keeping your invoices, receipts and business details is the thing the app is for, so
        the lawful basis is <strong>performing our contract with you</strong> — we cannot show you your own records
        without holding them. Keeping the app secure, and keeping enough of a record to stop somebody abusing it, rests
        on our <strong>legitimate interests</strong>. We do not rely on consent for any of it, and there is nothing we
        do with your records that you have to opt out of.
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

      <h2 className={H}>If something goes wrong</h2>
      <p className={P}>
        If you find a security problem, <Link href="/security" className="font-medium underline">tell us here</Link>. If
        anybody&apos;s information is ever put at risk, we tell the Information Commissioner&apos;s Office within 72
        hours of knowing, and we tell the people affected.
      </p>

      <h2 className={H}>Cookies</h2>
      <p className={P}>
        There are none for advertising, and none that follow you around. The app stores a few things in your browser so
        it works: whether you are signed in, which colour you picked, which panel you last had open, your signature
        if you sign an invoice, and an invoice or receipt you have started typing and not yet saved, so it is not lost if
        the page closes. A draft like that stays on your device only, and is not offered back after 30 days.
      </p>

      <h2 className={H}>Asking us something</h2>
      <p className={P}>
        Use <Link href="/feedback" className="font-medium underline">Feedback</Link> in the app. It goes straight to the
        person who made it.
      </p>

      <p className="mt-10 text-sm text-neutral-500">Last changed 20 October 2026.</p>
    </div>
  );
}
