"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { authFailed } from "@/lib/errorText";

// Off until Google is set up as a provider in Supabase: a button that leads to
// "provider is not enabled" is worse than no button.
export const googleOn = () => process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === "on";

// Google's own four colours: their sign-in branding rules ask for the mark as
// it is, so this is the one place a hex belongs in a component.
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="h-5 w-5 shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.2 5.6c4.2-3.9 7.1-9.6 7.1-17.1z" />
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.8l7.9-6.2z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2 1.4-4.7 2.3-8.7 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
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
