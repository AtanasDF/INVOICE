// What one person's work leaves behind on a device, and when it has to go.
//
// Signing out cleared the session and nothing else (signOut.ts removes the
// auth key and reloads). Every key below was a fixed string with no account
// in it, so the next person to sign in on the same device opened
// /free-invoice and found the previous one's business name, customer, lines,
// SORT CODE, ACCOUNT NUMBER and SIGNATURE -- enough to issue an invoice as
// them, payable into their bank account. A photograph of their receipt was
// waiting on /scan as well, because sign-out reloads the SAME tab and
// sessionStorage survives that.
//
// Clearing at sign-OUT was the obvious fix and is the wrong one: it costs
// somebody their half-typed invoice every time they sign out on purpose.
// Clearing when the ACCOUNT CHANGES costs nothing. Sign out and back in as
// yourself and your work is still there; sign in as somebody else and the
// previous person's work goes before anything can render it.
//
// No imports: the harness compiles this file on its own (tsconfig.logic.json).

export const LAST_ACCOUNT_KEY = "last-account";

// One person's own content or their account's own records. Each of these
// was a hazard on a shared, lent or sold phone.
export const PERSONAL_LOCAL_KEYS = [
  "free-invoice-draft",      // business name, customer, lines, bank details
  "free-invoice-signature",  // their actual signature, as an image
  "company-register",        // Companies House facts, keyed by their client ids
  "clients-not-duplicates",  // pairs of their client ids
  "receipts-link-skip",      // their receipt ids
  "invite-code",             // their own invite code
] as const;

export const PERSONAL_SESSION_KEYS = [
  "scan-handoff-capture",    // a photograph of a receipt, mid-scan
] as const;

// Deliberately NOT cleared: these belong to the DEVICE, not the account, and
// CLAUDE.md says so of the theme in as many words ("per device, not per
// account"). Wiping them would reset somebody's phone to light mode and
// re-show every tip because a colleague borrowed it.
export const DEVICE_KEYS = [
  "theme", "camera-allowed", "scanner-mode", "scanner-auto", "scanner-auto-zoom",
  "scan-engine", "came-from",
  // A prefix, not a whole key ("tip:<id>"): which tips somebody has already
  // read is a property of the phone, like the theme.
  "tip:",
] as const;

// Whether this is a different person at the keyboard, and so what has to go.
//
// `current` null means signed out, and nothing is cleared: the person may be
// signing back in as themselves, and their draft should survive that. It also
// means `previous` is left alone, so the NEXT sign-in is still compared
// against whoever last used the device rather than against nothing.
export function keysToClear(previous: string | null, current: string | null): { local: string[]; session: string[] } {
  if (!current || previous === current) return { local: [], session: [] };
  return { local: [...PERSONAL_LOCAL_KEYS], session: [...PERSONAL_SESSION_KEYS] };
}

// Whether `last-account` should be written, and to what. Only a real account
// is recorded, for the reason above.
export function accountToRemember(previous: string | null, current: string | null): string | null {
  return current ?? previous;
}

// The storage half, kept apart from the decision so the decision can be
// tested without a browser. Every access is guarded: storage throws outright
// in private mode, and failing to sign in is worse than failing to tidy up.
export function forgetOtherAccount(current: string | null): void {
  let previous: string | null = null;
  try {
    previous = localStorage.getItem(LAST_ACCOUNT_KEY);
  } catch {
    return; // storage blocked: nothing was stored to leave behind
  }
  const { local, session } = keysToClear(previous, current);
  for (const k of local) {
    try { localStorage.removeItem(k); } catch {}
  }
  for (const k of session) {
    try { sessionStorage.removeItem(k); } catch {}
  }
  const remember = accountToRemember(previous, current);
  try {
    if (remember) localStorage.setItem(LAST_ACCOUNT_KEY, remember);
  } catch {}
}
