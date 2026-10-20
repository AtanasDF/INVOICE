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
  "new-receipt-draft",       // a half-typed receipt: supplier, amounts, notes
  "new-invoice-draft",       // a half-typed invoice: customer, lines, prices
  "new-quote-draft",         // a half-typed quote: customer, lines, prices
] as const;

// The same, one key per record: unsaved changes to a draft invoice or quote,
// kept under its id (formDraft.ts).
export const PERSONAL_LOCAL_PREFIXES = [
  "invoice-edit:",
  "quote-edit:",
] as const;

// A supplier's half-typed prices on a /r/ page, one key per link (answerDraft.ts).
export const PERSONAL_SESSION_PREFIXES = [
  "quote-request-answer:",
] as const;

// Every key in `keys` that starts with one of `prefixes`, which is what a
// different account's arrival has to remove besides the fixed keys.
export function personalPrefixed(keys: string[], prefixes: readonly string[] = PERSONAL_LOCAL_PREFIXES): string[] {
  return keys.filter((k) => prefixes.some((p) => k.startsWith(p)));
}

// A getter, because naming sessionStorage at all throws where it is blocked.
function storedKeys(store: () => Storage): string[] {
  const keys: string[] = [];
  try {
    const s = store();
    for (let i = 0; i < s.length; i++) keys.push(s.key(i) ?? "");
  } catch {}
  return keys;
}

export const PERSONAL_SESSION_KEYS = [
  "scan-handoff-capture",    // a photograph of a receipt, mid-scan
  "scan-readings",           // what was read off their receipts, unsaved
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
  const swapped = local.length > 0;
  for (const k of [...local, ...(swapped ? personalPrefixed(storedKeys(() => localStorage)) : [])]) {
    try { localStorage.removeItem(k); } catch {}
  }
  for (const k of [...session, ...(swapped ? personalPrefixed(storedKeys(() => sessionStorage), PERSONAL_SESSION_PREFIXES) : [])]) {
    try { sessionStorage.removeItem(k); } catch {}
  }
  const remember = accountToRemember(previous, current);
  try {
    if (remember) localStorage.setItem(LAST_ACCOUNT_KEY, remember);
  } catch {}
}

// Done before the first paint, like the theme, and for a sharper reason.
//
// Doing it when AuthProvider resolved the session was a race: the session
// arrives asynchronously, so anything written between the page loading and
// that moment got wiped. Three harness suites caught it by seeding a scan
// handoff or a draft right after load and finding it gone -- and what they
// were really catching is that a clear which runs late can destroy work that
// is not the previous account's at all.
//
// Here there is no window. The script runs in <head>, before any page code,
// so by the time anything can write, the decision has been made and the
// marker is written. AuthProvider still calls forgetOtherAccount for a
// sign-in that happens without a full page load; by then this has already
// recorded the account, so it is a no-op unless somebody genuinely swapped.
//
// `authKey` is passed in rather than imported: the harness compiles this file
// on its own, and the key is built from the Supabase URL at runtime.
export function accountBoot(authKey: string): string {
  return `try{
var K=${JSON.stringify(authKey)},M=${JSON.stringify(LAST_ACCOUNT_KEY)};
var L=${JSON.stringify(PERSONAL_LOCAL_KEYS)},P=${JSON.stringify(PERSONAL_LOCAL_PREFIXES)},S=${JSON.stringify(PERSONAL_SESSION_KEYS)},Q=${JSON.stringify(PERSONAL_SESSION_PREFIXES)};
var r=localStorage.getItem(K),u=null;
if(r){if(r.indexOf("base64-")===0)r=atob(r.slice(7));var s=JSON.parse(r);u=(s&&s.user&&s.user.id)||null;}
if(u){var p=localStorage.getItem(M);
if(p!==u){for(var i=0;i<L.length;i++)localStorage.removeItem(L[i]);
for(var k=localStorage.length-1;k>=0;k--){var n=localStorage.key(k);for(var q=0;q<P.length;q++)if(n&&n.indexOf(P[q])===0){localStorage.removeItem(n);break;}}
for(var j=0;j<S.length;j++)sessionStorage.removeItem(S[j]);
for(var m=sessionStorage.length-1;m>=0;m--){var o=sessionStorage.key(m);for(var w=0;w<Q.length;w++)if(o&&o.indexOf(Q[w])===0){sessionStorage.removeItem(o);break;}}}
localStorage.setItem(M,u);}
}catch(e){}`.replace(/\s*\n\s*/g, "");
}
