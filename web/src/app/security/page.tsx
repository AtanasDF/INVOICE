import Link from "next/link";
import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/siteName";

export const metadata: Metadata = {
  title: `Report a security problem — ${SITE_NAME}`,
  description: "How to tell us about a security problem, and what happens after you do.",
};

const H = "mt-8 text-lg font-bold";
const P = "mt-3 text-neutral-800";
const LI = "mt-2 text-neutral-800";

// Somewhere to send a security problem, and a promise about what happens
// next. HMRC's terms of use ask for both: an easy way for anybody to report
// a risk, and a process that tells them within 72 hours.
//
// It points at the feedback form rather than an email address on purpose.
// invoiceover.com's mail goes to the inbox-import Worker, which silently
// drops anything that is not a per-user inbox address -- so a message to
// security@ would vanish with no bounce, which is worse than having no
// address at all. The feedback route emails a real person.
export default function Security() {
  return (
    <div className="mx-auto max-w-2xl py-4">
      <h1 className="text-2xl font-bold">Report a security problem</h1>
      <p className="mt-1 text-neutral-600">If you have found something that puts anybody&apos;s records at risk, tell us.</p>

      <h2 className={H}>How to tell us</h2>
      <p className={P}>
        Use the <Link href="/feedback" className="font-medium underline">feedback form</Link> and start your message with
        the word <strong>SECURITY</strong>. It goes straight to a person. You do not need an account to send it, and you
        will not be charged, thanked in public, or chased for your name.
      </p>
      <p className={P}>
        Tell us what you found and how to see it for ourselves. A rough description is worth far more than nothing —
        do not wait until you have a perfect write-up.
      </p>

      <h2 className={H}>What we do next</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li className={LI}>We reply to say we have it, normally the same day and always within three days.</li>
        <li className={LI}>We work out what, if anything, has been exposed, and fix it.</li>
        <li className={LI}>
          If anybody&apos;s personal information has been put at risk, we tell the Information Commissioner&apos;s Office
          within 72 hours of knowing, and we tell the people affected.
        </li>
        <li className={LI}>
          If it touches anything reached through an HMRC service, we report it to HMRC within 72 hours as well, with a
          name and a telephone number they can use.
        </li>
        <li className={LI}>We tell you what we found and when it was fixed.</li>
      </ul>

      <h2 className={H}>What not to do</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li className={LI}>Look at, change or keep anybody else&apos;s records. If you reach someone else&apos;s data by accident, stop and tell us.</li>
        <li className={LI}>Run anything that would knock the app over or slow it down for other people.</li>
        <li className={LI}>Make it public before it is fixed.</li>
      </ul>
      <p className={P}>
        Stay inside those and we will not come after you for finding it. Deliberately taking or wrecking somebody
        else&apos;s records is a different thing entirely.
      </p>

      <h2 className={H}>What else is written down</h2>
      <p className={P}>
        <Link href="/privacy" className="font-medium underline">Your information</Link> says what we keep and why.{" "}
        <Link href="/terms" className="font-medium underline">Terms</Link> says what the app promises.
      </p>
    </div>
  );
}
