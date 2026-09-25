"use client";

import { useState } from "react";
import { HELP_JOURNEYS } from "@/lib/helpJourneys";
import Walkthrough from "@/components/help/Walkthrough";
import Link from "next/link";
import HelpChat from "@/components/help/HelpChat";
import { helpChatOn } from "@/lib/helpChat";

// What the app can do, listed, each one openable.
//
// Atanas's instinct, and it is the right one: open with the list, not an
// empty box. An empty box asks somebody to know the question already; a
// list lets them recognise what they wanted, which is the whole difference
// for anybody unsure what to ask for.
export default function Help() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-2xl py-4">
      <h1 className="text-2xl font-bold">How it works</h1>
      <p className="mt-1 text-neutral-600">Pick the thing you want to do. Each one is a few steps, at your pace.</p>

      <div className="mt-5 space-y-3">
        {HELP_JOURNEYS.map((j) =>
          open === j.id ? (
            <div key={j.id}>
              <Walkthrough journey={j} />
              <button type="button" onClick={() => setOpen(null)} className="mt-2 min-h-11 text-sm font-medium text-neutral-700 underline">
                Close
              </button>
            </div>
          ) : (
            <button
              key={j.id}
              type="button"
              onClick={() => setOpen(j.id)}
              className="block w-full rounded-xl border bg-white p-5 text-left text-neutral-900 shadow-sm"
            >
              <span className="block font-medium">{j.title}</span>
              <span className="mt-1 block text-sm text-neutral-600">{j.summary}</span>
            </button>
          )
        )}
      </div>

      {/* Off by default. Without NEXT_PUBLIC_HELP_CHAT the page ends at the
          walkthroughs, mentions no chat, and asks nothing of any model. */}
      {helpChatOn() && <HelpChat />}

      {/* Always, chat or no chat. This is the last rung of the ladder and the
          only one that reaches a person; hiding it behind having typed
          something into the chat would leave somebody who does not know what
          to type with nowhere to go. */}
      <p className="mt-6 text-sm text-neutral-600">
        Not here?{" "}
        <Link href="/feedback" className="font-medium underline">Ask us</Link> and we will answer, and add it.
      </p>
    </div>
  );
}
