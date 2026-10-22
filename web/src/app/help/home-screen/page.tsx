"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { SITE_NAME } from "@/lib/siteName";
import { useIsIOS } from "@/lib/platform";
import { useInstallWay } from "@/lib/install";

// Putting the app on the home screen, a picture for every tap (Atanas,
// 2026-10-22: "photo step by step, so there's no way someone can get
// confused"). The pictures are drawn rather than photographed: a screenshot
// of one iPhone is wrong on the next iOS, while a drawing of where the button
// sits stays true, follows the app's colours and dark mode, and costs nothing
// to load on a depot's signal. The words under each picture ARE the step.

const PHONE = "relative mx-auto h-72 w-44 overflow-hidden rounded-[2rem] border-4 border-neutral-800 bg-white text-[10px] text-neutral-700 shadow-sm";
// What to tap, in the theme's own highlight, pulsing unless motion is turned down.
const TAP = "ring-4 ring-accent ring-offset-2 ring-offset-white motion-safe:animate-pulse";

function Phone({ children }: { children: ReactNode }) {
  return <div aria-hidden="true" className={PHONE}>{children}</div>;
}

function Page() {
  return (
    <div className="space-y-1.5 p-3 pt-5">
      <p className="text-xs font-bold text-neutral-900">{SITE_NAME}</p>
      <div className="h-2 w-24 rounded bg-neutral-200" />
      <div className="h-10 rounded-lg bg-neutral-900" />
      <div className="grid grid-cols-2 gap-1.5">
        <div className="h-8 rounded-lg bg-neutral-100" />
        <div className="h-8 rounded-lg bg-neutral-100" />
      </div>
      <div className="h-2 w-28 rounded bg-neutral-200" />
      <div className="h-2 w-20 rounded bg-neutral-200" />
    </div>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M8 7l4-4 4 4M6 11v9h12v-9" />
    </svg>
  );
}

function PlusSquare() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function HomeScreen() {
  return (
    <div className="grid grid-cols-4 gap-2 p-3 pt-6">
      {Array.from({ length: 11 }, (_, i) => (
        <div key={i} className="aspect-square rounded-lg bg-neutral-200" />
      ))}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" className={`aspect-square rounded-lg ${TAP}`} />
    </div>
  );
}

function Sheet({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="absolute inset-0 bg-neutral-900/30" />
      <div className="absolute inset-x-0 bottom-0 space-y-1 rounded-t-2xl bg-white p-2 pb-4">{children}</div>
    </>
  );
}

function Row({ label, icon, tap }: { label: string; icon?: ReactNode; tap?: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-lg bg-neutral-100 px-2 py-1.5 ${tap ? TAP : ""}`}>
      <span className={tap ? "font-bold text-neutral-900" : ""}>{label}</span>
      {icon}
    </div>
  );
}

// iPhone, Safari: the address and buttons sit at the bottom.
function SafariBar({ tapMore }: { tapMore?: boolean }) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-neutral-100 px-2 pt-1.5 pb-4">
      <span className="rounded-full bg-white px-1.5 py-1">‹</span>
      <span className="flex-1 truncate rounded-full bg-white px-2 py-1 text-center">{SITE_NAME.toLowerCase()}</span>
      <span className={`rounded-full bg-white px-1.5 py-1 font-bold ${tapMore ? TAP : ""}`}>•••</span>
    </div>
  );
}

// Android, Chrome: the address and the menu sit at the top.
function ChromeBar({ tapMenu }: { tapMenu?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 bg-neutral-100 px-2 pt-4 pb-1.5">
      <span className="flex-1 truncate rounded-full bg-white px-2 py-1">{SITE_NAME.toLowerCase()}</span>
      <span className={`rounded-full bg-white px-1.5 py-0.5 text-sm font-bold leading-none ${tapMenu ? TAP : ""}`}>⋮</span>
    </div>
  );
}

type Step = { words: string; picture: ReactNode };

const IPHONE: Step[] = [
  {
    words: `Open ${SITE_NAME} in Safari, the iPhone's own browser with the compass icon. Tap the three dots (•••) at the bottom right.`,
    picture: <Phone><Page /><SafariBar tapMore /></Phone>,
  },
  {
    words: "Tap Share.",
    picture: (
      <Phone>
        <Page />
        <Sheet>
          <Row label="Share" icon={<ShareIcon />} tap />
          <Row label="Add to Favourites" />
          <Row label="Add Bookmark" />
          <Row label="Find on Page" />
        </Sheet>
      </Phone>
    ),
  },
  {
    words: "Slide the list up and tap Add to Home Screen. If you can't see it, tap View More at the bottom of the list first.",
    picture: (
      <Phone>
        <Page />
        <Sheet>
          <Row label="Copy" />
          <Row label="Add to Reading List" />
          <Row label="Add to Home Screen" icon={<PlusSquare />} tap />
          <Row label="View More" />
        </Sheet>
      </Phone>
    ),
  },
  {
    words: "Leave Open as Web App switched on, then tap Add at the top right.",
    picture: (
      <Phone>
        <div className="flex items-center justify-between p-3 pt-5">
          <span>Cancel</span>
          <span className={`rounded px-1 font-bold text-neutral-900 ${TAP}`}>Add</span>
        </div>
        <div className="mx-3 flex items-center gap-2 rounded-lg bg-neutral-100 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" className="h-8 w-8 rounded-lg" />
          <span className="font-bold text-neutral-900">{SITE_NAME}</span>
        </div>
        <div className="mx-3 mt-2 flex items-center justify-between rounded-lg bg-neutral-100 p-2">
          <span>Open as Web App</span>
          <span className="flex h-4 w-7 items-center justify-end rounded-full bg-neutral-900 p-0.5"><span className="h-3 w-3 rounded-full bg-white" /></span>
        </div>
      </Phone>
    ),
  },
  {
    words: `Done. ${SITE_NAME} is on your home screen. Open it from there and sign in once more: the app is kept apart from Safari, and stays signed in from then on.`,
    picture: <Phone><HomeScreen /></Phone>,
  },
];

const ANDROID: Step[] = [
  {
    words: `Open ${SITE_NAME} in Chrome. Tap the three dots (⋮) at the top right.`,
    picture: <Phone><ChromeBar tapMenu /><Page /></Phone>,
  },
  {
    words: "Tap Add to home screen. Some phones say Install app instead. It's the same thing.",
    picture: (
      <Phone>
        <ChromeBar />
        <Page />
        <div className="absolute top-8 right-1 w-32 space-y-1 rounded-lg bg-white p-1.5 shadow-lg ring-1 ring-neutral-200">
          <Row label="New tab" />
          <Row label="History" />
          <Row label="Add to home screen" tap />
          <Row label="Settings" />
        </div>
      </Phone>
    ),
  },
  {
    words: "Tap Install. On some phones the button says Add.",
    picture: (
      <Phone>
        <ChromeBar />
        <Page />
        <div className="absolute inset-0 bg-neutral-900/30" />
        <div className="absolute inset-x-3 top-24 space-y-2 rounded-xl bg-white p-3">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="" className="h-8 w-8 rounded-lg" />
            <span className="font-bold text-neutral-900">Install app?</span>
          </div>
          <div className="flex justify-end gap-3">
            <span className="py-0.5">Cancel</span>
            <span className={`rounded px-1.5 py-0.5 font-bold text-neutral-900 ${TAP}`}>Install</span>
          </div>
        </div>
      </Phone>
    ),
  },
  {
    words: `Done. ${SITE_NAME} is on your home screen with your other apps. Tap it to open, and you're already signed in.`,
    picture: <Phone><HomeScreen /></Phone>,
  },
];

export default function HomeScreenHelp() {
  const ios = useIsIOS();
  const installed = useInstallWay() === "installed";
  const [picked, setPicked] = useState<"iphone" | "android" | null>(null);
  const phone = picked ?? (ios ? "iphone" : "android");
  const steps = phone === "iphone" ? IPHONE : ANDROID;

  return (
    <div className="mx-auto max-w-2xl py-4">
      <h1 className="text-2xl font-bold">Put {SITE_NAME} on your phone</h1>
      <p className="mt-1 text-neutral-600">
        It gets its own icon and opens full screen, like any other app. Nothing to download from a shop. It takes four or five taps.
      </p>

      {installed && (
        <p className="mt-4 rounded-xl bg-neutral-50 p-4 text-neutral-800">You&apos;re already using it from your home screen. Nothing else to do.</p>
      )}

      <div role="tablist" aria-label="Which phone" className="mt-5 grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1">
        {([["iphone", "iPhone"], ["android", "Android"]] as const).map(([value, text]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={phone === value}
            onClick={() => setPicked(value)}
            className={`rounded-md px-3 py-2.5 text-base font-medium ${phone === value ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}
          >
            {text}
          </button>
        ))}
      </div>

      <ol className="mt-5 space-y-4">
        {steps.map((s, i) => (
          <li key={`${phone}-${i}`} className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
            <p className="flex gap-3 text-base font-medium">
              <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm font-bold text-white">
                {i + 1}
              </span>
              <span>{s.words}</span>
            </p>
            <div className="mt-4">{s.picture}</div>
          </li>
        ))}
      </ol>

      <p className="mt-5 text-sm text-neutral-600">
        {phone === "iphone"
          ? "Using Chrome on an iPhone? Tap the Share button at the top right, then Add to Home Screen, then Add."
          : "Using a Samsung phone's own browser? Tap the menu (three lines) at the bottom, then Add page to, then Home screen."}
      </p>
      <p className="mt-3 text-sm text-neutral-600">
        Stuck? <Link href="/feedback" className="font-medium underline">Tell us</Link> what you see and we&apos;ll help.
      </p>
    </div>
  );
}
