import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/siteName";

export const metadata: Metadata = { title: `No signal — ${SITE_NAME}`, robots: { index: false } };

// Shown by the service worker when a page is asked for with no connection.
// Its job is to say plainly that nothing is lost and what to do — the browser's
// own error page makes an app look broken rather than offline, which on a site
// full of someone's accounts is a frightening difference.
export default function Offline() {
  return (
    <div className="mx-auto max-w-lg py-8">
      <h1 className="text-2xl font-bold">No signal just now</h1>
      <p className="mt-2 text-neutral-700">
        Nothing has been lost. Everything you have saved is still there, and will be waiting when you have a bar or two.
      </p>
      <div className="mt-6 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <h2 className="font-semibold">What you can do meanwhile</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-neutral-800">
          <li>Take photographs of your receipts with the phone&apos;s own camera, and scan them in later.</li>
          <li>Write down anything you need to remember — it takes seconds and saves an argument.</li>
        </ul>
      </div>
      <p className="mt-6 text-neutral-700">
        When the signal comes back, this page will load by itself if you pull it down, or tap below.
      </p>
      <a href="/" className="mt-3 inline-block rounded-lg bg-neutral-900 px-4 py-3 text-base font-bold text-white">
        Try again
      </a>
    </div>
  );
}
