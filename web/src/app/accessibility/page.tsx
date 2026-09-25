import Link from "next/link";
import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/siteName";

export const metadata: Metadata = {
  title: `How usable this is — ${SITE_NAME}`,
  description: "What works, what does not, and what we have not checked.",
};

const H = "mt-8 text-lg font-bold";
const P = "mt-3 text-neutral-800";
const LI = "mt-2 text-neutral-800";

// An accessibility statement that names our own failures.
//
// notes/competitor-research.md: not one of the twelve apps publishes one of
// these for their app, and the few that exist cover the marketing website.
// Starling's is the model -- candid, specific, and it names what is broken.
//
// The rule for this page: every claim on it is measured by something in
// harness/, and anything we have not measured is written down as not
// measured rather than left out. A statement that only lists successes is
// marketing.
export default function Accessibility() {
  return (
    <div className="mx-auto max-w-2xl py-4">
      <h1 className="text-2xl font-bold">How usable this is</h1>
      <p className="mt-1 text-neutral-600">What works, what does not, and what we have not checked.</p>

      <h2 className={H}>Where we stand</h2>
      <p className={P}>
        We aim at level AA of the Web Content Accessibility Guidelines, version 2.2. We are not audited by anybody, and
        nobody has paid an expert to go through this — so treat the list below as what we have measured ourselves, not
        as a certificate.
      </p>
      <p className={P}>
        The rules that cover public bodies do not apply to us. What does apply is the duty under the Equality Act 2010
        to make reasonable adjustments, and that duty is anticipatory: you plan for disabled users before anybody
        complains. That is what this page is for.
      </p>

      <h2 className={H}>What we have made work</h2>
      <p className={P}>
        Each of these is checked automatically every time the app is built, against the real screens, not asserted here:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li className={LI}>
          <strong>The text size you have already chosen.</strong> If you have turned the type up on your phone, the app
          follows it — all of it, not just the words, so the screens grow rather than the writing spilling out of boxes
          that stayed put. Checked at twice the normal size on ten screens.
        </li>
        <li className={LI}>
          <strong>Dark, light, and five colours.</strong> Every one of them measured for contrast on the pages a new
          account meets first, because the ordinary grey was failing before anybody checked.
        </li>
        <li className={LI}>
          <strong>Keyboard only.</strong> Every screen can be used without a mouse, and following a link moves you into
          the new page rather than leaving you where the old one was.
        </li>
        <li className={LI}>
          <strong>Refusals say which box they are about.</strong> If a form will not save, the box at fault is marked
          and the message is tied to it, so a screen reader can take you there.
        </li>
        <li className={LI}>
          <strong>Nothing moves unless you ask.</strong> If your device says you want less movement, nothing animates
          and nothing plays itself.
        </li>
        <li className={LI}>
          <strong>Things are big enough to hit</strong> — at least 24 by 24 pixels, and the app still works at 320
          pixels wide, which is the narrowest phone still in use.
        </li>
        <li className={LI}>
          <strong>Plain words.</strong> No jargon on the way in, and when something goes wrong you are told what
          happened rather than shown a code.
        </li>
      </ul>

      <h2 className={H}>What is not good enough yet</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li className={LI}>
          <strong>Buttons are 36 pixels tall, not 44.</strong> That passes the guidelines and fails what Apple and
          Google both ask for. For somebody with cold hands in a builders&apos; merchant, the phone makers are right and
          the guidelines are not. We have not fixed it.
        </li>
        <li className={LI}>
          <strong>Nobody independent has tested this.</strong> Everything above is measured by our own tests. Automatic
          checks find perhaps a third of real problems; the rest are found by people, and no disabled person has been
          paid to try this app.
        </li>
        <li className={LI}>
          <strong>The camera.</strong> Scanning a receipt means aiming a phone at a piece of paper. We have not worked
          out how somebody who cannot see the viewfinder does that, and the honest answer today is: type it in instead,
          which every screen allows.
        </li>
        <li className={LI}>
          <strong>Colour on charts.</strong> The spending chart reads its colours from the theme and is described in
          words for a screen reader, but we have not checked it for the commonest kinds of colour blindness.
        </li>
        <li className={LI}>
          <strong>We have not tested with real screen readers.</strong> Not VoiceOver, not TalkBack, not JAWS or NVDA.
          The markup is built to work with them and is checked by machine. That is not the same thing.
        </li>
      </ul>

      <h2 className={H}>If something here stops you</h2>
      <p className={P}>
        Tell us through <Link href="/feedback" className="font-medium underline">Feedback</Link>. Say what you were
        trying to do and what got in the way — you do not need to know the name of the problem. We will answer, and if
        it is our fault we will say so here.
      </p>
      <p className={P}>
        If we get it wrong and will not put it right, you can take it up with the Equality Advisory and Support Service.
      </p>

      <p className="mt-8 text-sm text-neutral-500">Last gone through on 25 September 2026.</p>
    </div>
  );
}
