// Supabase refuses a sign-in with no token, or a stale one, and says so in
// Cloudflare's words: "captcha protection: request disallowed
// (missing-input-response)". That is the front door of the app, and the check
// is invisible, so the person reading it has no idea what a captcha even is
// here -- they pressed a button and were told off in code.
//
// It is not rare either: the check finishes a beat after the page does, so
// anybody quick, or on a slow connection, meets it.
export function peopleCheckProblem(err: unknown): string | null {
  const m = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  if (!/captcha|turnstile/.test(m)) return null;
  if (/missing-input-response|missing input|timeout-or-duplicate|expired/.test(m)) {
    return "The check that you're a person hadn't finished. Give it a second and press the button again.";
  }
  return "The check that you're a person didn't go through. Reload the page and try once more.";
}
