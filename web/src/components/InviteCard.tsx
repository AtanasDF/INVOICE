"use client";

import { useEffect, useState } from "react";
import { SITE_NAME } from "@/lib/siteName";
import { invitesOn, myInviteCode } from "@/lib/invites";

// "Tell a mate" (notes/promotion.md). The whole depot plan rests on drivers
// telling each other, so this is the one bit of the app that asks them to.
//
// The link is the thing worth copying, not the code: a code has to be typed,
// and a link in a WhatsApp group is one tap. The code is shown underneath for
// the times it gets read aloud across a yard.
export default function InviteCard({ className = "" }: { className?: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (!invitesOn()) return;
    let dead = false;
    (async () => {
      const c = await myInviteCode();
      if (!dead) setCode(c);
    })();
    return () => { dead = true; };
  }, []);

  if (!invitesOn() || !code) return null;

  const link = `${typeof window === "undefined" ? "" : window.location.origin}/?invite=${code}`;
  const message = `I use ${SITE_NAME} for my invoices and receipts — photograph a bill and it reads itself. Free. Use my link and we both get 300 extra: ${link}`;

  async function share() {
    // The share sheet where there is one: in a depot this ends in WhatsApp,
    // which is where it needs to go. Copying is the fallback, not the plan.
    try {
      const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
      if (nav.share) {
        await nav.share({ text: message });
        return;
      }
      await navigator.clipboard.writeText(message);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <section className={`space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm ${className}`}>
      <div>
        <h2 className="font-semibold">Tell a mate</h2>
        <p className="mt-1 text-neutral-600">
          Send them your link. When they photograph their first document, you both get 300 extra for that month.
        </p>
      </div>

      <button type="button" onClick={share} className="w-full rounded-lg bg-neutral-900 px-4 py-3 text-base font-bold text-white">
        Send my link
      </button>

      {state === "copied" && <p className="text-sm text-neutral-700">Copied. Paste it into a message.</p>}
      {state === "failed" && <p role="alert" className="text-sm text-red-600">Couldn&apos;t share it. The code below works just as well.</p>}

      <p className="text-sm text-neutral-600">
        Or give them the code: <span className="font-mono text-base font-bold tracking-wider text-neutral-900">{code}</span>
      </p>
      <p className="text-xs text-neutral-500">Nothing is paid until they actually scan something, and neither of you can claim it twice.</p>
    </section>
  );
}
