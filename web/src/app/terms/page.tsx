import Link from "next/link";
import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/siteName";

export const metadata: Metadata = {
  title: `Terms — ${SITE_NAME}`,
  description: "What you can expect from the app, and what it expects from you.",
};

const H = "mt-8 text-lg font-bold";
const P = "mt-3 text-neutral-800";
const LI = "mt-2 text-neutral-800";

export default function Terms() {
  return (
    <div className="mx-auto max-w-2xl py-4">
      <h1 className="text-2xl font-bold">Terms</h1>
      <p className="mt-1 text-neutral-600">What you can expect from {SITE_NAME}, and what it expects from you.</p>

      <h2 className={H}>What this is</h2>
      <p className={P}>
        A tool for keeping your invoices, receipts and expenses in one place. It is free to use. If that ever changes
        you will be told first, and nothing you have already put in will be held to ransom.
      </p>

      <h2 className={H}>It is not an accountant</h2>
      <p className={P}>
        The app adds up what you give it and shows you estimates — including anything it says about tax or VAT. Those
        are working figures to help you keep track, not advice, and not a return. What you file with HMRC is your
        responsibility, and if the numbers matter, check them with an accountant.
      </p>

      <h2 className={H}>What it reads for you</h2>
      <p className={P}>
        When you photograph a document it is read automatically, and machines misread things — a faded total, an odd
        date, a handwritten figure. What it fills in is a suggestion. Check it before you rely on it. Anything it is not
        sure of is left blank on purpose rather than guessed at.
      </p>

      <h2 className={H}>Your account</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li className={LI}>Keep your password to yourself. What happens under your account is treated as you.</li>
        <li className={LI}>One account per person or business. Making many to get round a limit is not on.</li>
        <li className={LI}>Use a real email address you will still have next year — it is how you get back in.</li>
      </ul>

      <h2 className={H}>What you must not do</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li className={LI}>Break the law with it, or use it to defraud anyone.</li>
        <li className={LI}>Upload someone else&apos;s documents that you have no right to.</li>
        <li className={LI}>Attack it, or use it as a free machine for reading documents in bulk.</li>
      </ul>
      <p className={P}>
        If an account is doing one of those, it can be suspended. Where it is a misunderstanding rather than an attack,
        you will be told what happened and given a way to put it right.
      </p>

      <h2 className={H}>Your records are yours</h2>
      <p className={P}>
        Everything you make can be saved to your own device whenever you like. If you want to leave, take your files and
        ask through <Link href="/feedback" className="font-medium underline">Feedback</Link> for the account to be
        deleted.
      </p>

      <h2 className={H}>What we do not promise</h2>
      <p className={P}>
        The app is provided as it is. It is looked after carefully and backed up, but no website is perfect and none is
        available every minute of every year. Keep your own copies of anything you could not bear to lose — the Save
        buttons are there for exactly that. Nothing here takes away rights you have as a consumer under UK law.
      </p>

      <h2 className={H}>Changes</h2>
      <p className={P}>
        If these terms change in a way that matters, you will be told in the app rather than quietly.
      </p>

      <p className="mt-10 text-sm text-neutral-500">Last changed 23 September 2026. English law applies.</p>
    </div>
  );
}
