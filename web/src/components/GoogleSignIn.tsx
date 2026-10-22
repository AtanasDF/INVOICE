"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { authFailed } from "@/lib/errorText";

// Off until Google is set up as a provider in Supabase: a button that leads to
// "provider is not enabled" is worse than no button.
export const googleOn = () => process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === "on";

// Google's own four colours, kept in a picture of their own: their sign-in
// branding rules ask for the mark as it is, and no theme should tint it.
function GoogleMark() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/google-g.svg" alt="" className="h-5 w-5 shrink-0" />;
}

export default function GoogleSignIn({ onError }: { onError: (message: string) => void }) {
  const busy = useRef(false);
  const [leaving, setLeaving] = useState(false);

  async function go() {
    if (busy.current) return;
    busy.current = true;
    setLeaving(true);
    // Back to /login, which sends a signed-in visitor on to where they were going.
    const next = new URLSearchParams(window.location.search).get("next");
    const back = `${window.location.origin}/login${next ? `?next=${encodeURIComponent(next)}` : ""}`;
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: back } });
    if (error) {
      busy.current = false;
      setLeaving(false);
      onError(authFailed(error, "Google sign-in didn't open. Try again, or use your email below."));
    }
  }

  return (
    <button
      type="button"
      onClick={() => void go()}
      disabled={leaving}
      className="flex w-full items-center justify-center gap-3 rounded-lg border bg-white px-4 py-3.5 text-base font-bold text-neutral-900 transition active:scale-95 disabled:opacity-50 motion-reduce:transition-none"
    >
      <GoogleMark />
      {leaving ? "Opening Google…" : "Continue with Google"}
    </button>
  );
}
