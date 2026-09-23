"use client";

import { useEffect, useRef, useState } from "react";

// The "prove you're a person" check on sign-up (Atanas, 2026-09-23, protection
// 1 of the three he chose). Cloudflare's Turnstile: free, and invisible to
// almost everybody — most people never see anything at all, which is exactly
// why it beats a picture puzzle for an audience of drivers on a phone in a
// depot.
//
// INERT UNTIL HE MAKES A KEY. Without NEXT_PUBLIC_TURNSTILE_SITE_KEY this
// renders nothing and reports no token, so signing in and signing up behave
// exactly as they do today. Supabase holds the matching secret and does the
// checking; nothing here can be trusted on its own.
//
// Loaded by hand rather than through a package: it is one script tag and one
// call, and a dependency for that would be more to keep up to date than to
// write.
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const turnstileOn = () => TURNSTILE_SITE_KEY.length > 0;

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Api = {
  render: (el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; "expired-callback"?: () => void; "error-callback"?: () => void; theme?: string; size?: string }) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window { turnstile?: Api }
}

let loading: Promise<void> | null = null;
function load(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = SRC;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("turnstile"));
    document.head.appendChild(el);
  });
  return loading;
}

// A token is good for one attempt, so the widget is reset after each one. The
// parent asks for that through `resetKey`: change it, and a fresh challenge is
// drawn.
export default function Turnstile({ onToken, resetKey = 0 }: { onToken: (t: string) => void; resetKey?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (!turnstileOn() || !box.current) return;
    let dead = false;
    load()
      .then(() => {
        if (dead || !box.current || !window.turnstile) return;
        id.current = window.turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (t) => onToken(t),
          "expired-callback": () => onToken(""),
          "error-callback": () => setBroken(true),
          size: "flexible",
        });
      })
      .catch(() => setBroken(true));
    return () => {
      dead = true;
      if (id.current && window.turnstile) window.turnstile.remove(id.current);
      id.current = null;
    };
    // onToken is stable enough in practice; re-rendering the widget on every
    // keystroke would throw away a solved challenge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resetKey && id.current && window.turnstile) {
      window.turnstile.reset(id.current);
      onToken("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  if (!turnstileOn()) return null;

  return (
    <div>
      <div ref={box} />
      {broken && (
        // Cloudflare being unreachable must not lock anybody out of their own
        // records: Supabase is what actually enforces this, and it will refuse
        // a missing token itself if the check is switched on.
        <p className="text-sm text-neutral-600">The people-check didn&apos;t load. Try again, or reload the page.</p>
      )}
    </div>
  );
}
