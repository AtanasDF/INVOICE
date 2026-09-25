import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { THEME_BOOT } from "@/lib/theme";

// The 404 for an address that matches no route at all.
//
// It renders its own <html> and <body> on purpose: this file is served at the
// routing level and never touches the root layout, which is the whole point.
// The layout carries AppShell, and AppShell's Gate returns null for a stranger
// on a page that needs an account -- so a 404 rendered inside it was never
// shown to the one person most likely to meet it, somebody following a
// mistyped or out-of-date link who has no account at all.
//
// No header, no navigation, nothing that needs a session: it cannot know
// whether there is one. Just what happened, that nothing of theirs is lost,
// and the way back.
//
// The docs call this experimental and say it needs `experimental.globalNotFound`
// in next.config.ts. It does not, in this version: with that flag removed and
// .next deleted for a clean build, a missing address still answers 404 with
// this page. So the flag is not set -- an experimental switch nothing needs is
// a liability rather than a safeguard. If a Next upgrade ever starts serving
// the framework's own 404 here, that flag is the first thing to try, and
// test-route-guards will say so before anybody notices in the wild.
export const metadata: Metadata = {
  title: "That page isn't here · Invoiceover",
  description: "The address may be mistyped, or the page may have moved.",
};

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <head>
        {/* Without this the page ignores a chosen theme, because nothing above
            it has run. It is the same boot script the root layout uses. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-screen bg-neutral-50 text-neutral-900">
        <main className="mx-auto max-w-2xl px-4 py-10">
          <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
            <h1 className="text-2xl font-bold">That page isn&apos;t here</h1>
            <p className="mt-1 text-neutral-600">
              The address may be mistyped, or the page may have moved. Nothing of yours has gone anywhere.
            </p>
            <Link href="/" className="mt-4 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
              Back to the start
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
