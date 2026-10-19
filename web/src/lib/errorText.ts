// Supabase errors are plain objects with a message, not Error instances.
//
// This one hands the message straight through, so it is ONLY for a call
// site where everything that can be thrown is a sentence the app wrote
// itself. Four such sites remain and were each checked on 2026-09-24: the
// postcode lookup ("Couldn't find one of those postcodes."), the price
// guide (the route's own `error`), and the two file readers ("Couldn't
// open that file.", "Couldn't read that image."). Anything that can carry
// a database error uses saveFailed instead -- twelve sites did not, and
// were showing Postgres's own wording to people.
export function errorText(err: unknown, fallback: string): string {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : fallback;
}

// A save that failed. Errors the app raised itself are already written for
// the person reading them ("This invoice has payments recorded against it")
// and go straight through; the database's own codes and a dropped
// connection get plain English instead of "Failed to fetch" or "23505".
export function saveFailed(err: unknown, fallback: string): string {
  const e = err as { code?: unknown; message?: unknown } | null;
  const message = typeof e?.message === "string" ? e.message : "";
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return "Couldn't reach your records. Check your connection and try again.";
  }
  if (err instanceof Error) return message || fallback;
  const code = typeof e?.code === "string" ? e.code : "";
  if (code === "23505") return "That one is already there.";
  if (code === "23503") return "Something else in your records is linked to this, so it can't be changed.";
  if (code === "42501") return "This account isn't allowed to do that.";
  if (code === "PGRST204") return "This needs a database change that hasn't been run yet. Nothing was saved.";
  // Our own database functions raise their own sentences, already written
  // for the person reading them, under a chosen SQLSTATE: P0001, and these
  // three, which nothing else in this app raises. 23503 and 42501 are NOT on
  // the list -- Postgres raises those itself, in its own words, and the two
  // sentences above are what to say instead.
  //   40001  the answer changed since the page loaded
  //   55000  this list has gone out / this request is closed
  //   22023  that isn't an answer the app knows
  if (["P0001", "40001", "55000", "22023"].includes(code) && message) return message;
  // Anything else: the caller's sentence knows what was being done, which
  // "XX000" never will. The real one goes to the console.
  console.error(fallback, err);
  return fallback;
}

// A page that couldn't load says the same plain thing however it failed:
// "JSON object requested, multiple rows returned" tells the person holding
// the phone nothing, and what they can actually do is check their signal.
// The real reason still goes to the console for us.
export function loadFailed(err: unknown, what: string, advice = "Check your connection and try again."): string {
  console.error(`Couldn't load ${what}`, err);
  return `Couldn't load ${what}. ${advice}`;
}

// Neither invoicePdf.ts nor documentPdf.ts throws a sentence written for a
// person, so anything they throw is pdf-lib's or the browser's. Two of the
// three places this is shown are pages a CUSTOMER sees, where nobody signed in
// is watching and a stray "Invalid PDF structure" would be the whole of what
// they are told.
export const PDF_FAILED = "Couldn't make the PDF. Try again, or use Print instead.";

// Signed out part-way through something. "Please sign in again" said what
// to do but not what had happened, so it read as the app asking a favour
// rather than telling somebody their session had run out.
export const SIGNED_OUT = "You've been signed out. Sign in again, then try that once more.";

// Said on two screens -- making an account and resetting a password --
// which had two different sentences for the same mistake.
export const PASSWORDS_DIFFER = "The two passwords are not the same. Type the same one in both boxes.";

// The sign-in library's errors are real Error objects, so saveFailed hands
// their words straight through: "Invalid login credentials", "email rate
// limit exceeded", "For security purposes, you can only request this after
// 42 seconds." Each is said in plain words here, by the code GoTrue gives;
// one it doesn't know falls back to the caller's sentence. An Error the app
// threw itself is not an auth error and still goes through as written.
const AUTH_WORDS: Record<string, string> = {
  invalid_credentials: "That email and password don't match an account. Check both, or press \"Forgotten your password?\".",
  over_email_send_rate_limit: "We've sent this address a few emails already. Wait a few minutes, then try again.",
  over_request_rate_limit: "That's a lot of tries in a short time. Wait a minute, then try again.",
  email_exists: "There's already an account with that email. Sign in instead.",
  user_already_exists: "There's already an account with that email. Sign in instead.",
  email_address_invalid: "That email address doesn't look right.",
  weak_password: "That password is too easy to guess. Use a longer one.",
  same_password: "That's the password you have now. Pick a different one.",
  otp_expired: "That code or link has run out. Send yourself a new one.",
  signup_disabled: "New accounts can't be made just now. Try again later.",
};

export function authFailed(err: unknown, fallback: string): string {
  const e = err as { __isAuthError?: unknown; code?: unknown; message?: unknown } | null;
  if (!e || !e.__isAuthError) return saveFailed(err, fallback);
  const message = typeof e.message === "string" ? e.message : "";
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return "Couldn't reach the sign-in service. Check your connection and try again.";
  }
  const wait = /only request this after (\d+) seconds?/i.exec(message);
  if (wait) return `Wait ${wait[1]} seconds, then try again.`;
  const said = typeof e.code === "string" ? AUTH_WORDS[e.code] : undefined;
  if (said) return said;
  console.error(fallback, err);
  return fallback;
}
