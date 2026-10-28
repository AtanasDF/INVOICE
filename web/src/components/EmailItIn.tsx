"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { businessProfileStore } from "@/lib/storage";
import { generateInboxToken, inboxAddress } from "@/lib/inboxToken";

// Their own private address, which the Worker receives and files for review
// (Atanas, 2026-09-24). Back on Home on 2026-10-28, the evening it went with
// the upload panel and he asked where it was: an address you forward bills to
// is used from the inbox, so it has to be findable without a trip to Settings.
export function useEmailItIn(token: string | null) {
  const [open, setOpen] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  // Two presses made two tokens and the last save won, while the address
  // shown was whichever call resolved last -- possibly the dead one.
  const makingNow = useRef(false);
  const address = token ? inboxAddress(token) : made;

  async function toggle() {
    const opening = !open;
    setOpen(opening);
    // Made on the first tap, silently: nobody goes to Settings to ask for an
    // address they have never heard of.
    if (!opening || address || makingNow.current) return;
    makingNow.current = true;
    setMaking(true);
    // A failed read or save threw past setMaking(false), and "Making your
    // address…" stayed up for good. Null is the box that says it couldn't.
    try {
      const current = await businessProfileStore.get();
      const t = current.inboxToken ?? generateInboxToken();
      if (!current.inboxToken && !(await businessProfileStore.save({ ...current, inboxToken: t }))) throw new Error("not saved");
      setMade(inboxAddress(t));
    } catch (err) {
      console.error("email-in address", err);
      setMade(null);
    } finally {
      makingNow.current = false;
      setMaking(false);
    }
  }

  return { open, toggle, address, making };
}

export function EmailAddressBox({ address, making }: { address: string | null; making: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl bg-white p-4 text-sm shadow-sm">
      {making ? (
        <p role="status" className="text-neutral-700">Making your address&hellip;</p>
      ) : address ? (
        <>
          <p className="text-neutral-700">
            Forward any bill or receipt to this address and it lands in <strong>Needs review</strong>. It is yours alone.
          </p>
          <p className="mt-2 font-mono text-base wrap-anywhere text-neutral-900">{address}</p>
          <button
            type="button"
            onClick={() => { void navigator.clipboard.writeText(address).then(() => setCopied(true)).catch(() => setCopied(false)); }}
            className="mt-3 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
          >
            {copied ? "Copied" : "Copy the address"}
          </button>
          <span role="status" className="sr-only">{copied ? "Address copied." : ""}</span>
        </>
      ) : (
        <p className="text-neutral-700">
          We could not make your address just now.{" "}
          <Link href="/settings" className="font-medium underline">Try from Settings</Link>, and anything you forward to it lands in Needs review.
        </p>
      )}
    </div>
  );
}

export function MailIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  );
}
