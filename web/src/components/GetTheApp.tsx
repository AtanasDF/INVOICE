"use client";

import { useState } from "react";
import { SITE_NAME } from "@/lib/siteName";
import { askToInstall, useInstallWay } from "@/lib/install";

// What to do differs per phone, and being told the wrong steps is worse than
// being told none — so nothing is shown until the browser has said which case
// it is, and someone already running it standalone is shown nothing at all.
const STEP = "flex gap-3 text-base text-neutral-800";
const NUM = "flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white";

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-2.5">
      {steps.map((s, i) => (
        <li key={s} className={STEP}>
          <span aria-hidden className={NUM}>{i + 1}</span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export default function GetTheApp({ className = "" }: { className?: string }) {
  const way = useInstallWay();
  const [failed, setFailed] = useState(false);

  if (way === "installed") return null;

  return (
    <section className={`space-y-4 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm ${className}`}>
      <div>
        <h2 className="text-lg font-bold">Put {SITE_NAME} on your phone</h2>
        <p className="mt-1 text-neutral-600">
          It gets its own icon and opens full screen, like any other app. Nothing to download from a shop.
        </p>
      </div>

      {way === "prompt" && !failed && (
        <button
          type="button"
          onClick={async () => setFailed(!(await askToInstall()))}
          className="w-full rounded-lg bg-neutral-900 px-4 py-3.5 text-base font-bold text-white"
        >
          Install it
        </button>
      )}

      {way === "ios" && (
        <Steps
          steps={[
            "Tap the share button at the bottom of the screen — the square with an arrow coming out of it.",
            "Scroll down the list and tap Add to Home Screen.",
            "Tap Add. The icon appears with your other apps.",
          ]}
        />
      )}

      {(way === "manual" || failed) && (
        <Steps
          steps={[
            "Open the browser's menu — the three dots or lines.",
            `Tap Install ${SITE_NAME}, or Add to Home screen.`,
            "Confirm, and the icon appears with your other apps.",
          ]}
        />
      )}

      <p className="text-sm text-neutral-600">
        You can keep using it in this tab instead. The icon just saves you finding it again.
      </p>
    </section>
  );
}
