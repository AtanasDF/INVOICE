import { supabase } from "@/lib/supabaseClient";

// Invite a friend (migration-037, notes/invite-a-friend-design.md).
//
// OFF BY DEFAULT. Without NEXT_PUBLIC_INVITES no screen mentions it and no
// code is ever made, so this ships and deploys changing nothing — the same way
// the scan limits did.
//
// The reward is not granted here and cannot be: `reward_invite_if_due` is
// revoked from `authenticated` on purpose, and is reached only from inside
// `take_scans`. Nobody can ask to be paid; they can only earn it by scanning.
export const invitesOn = () => (process.env.NEXT_PUBLIC_INVITES ?? "") === "on";

const KEY = "invite-code";

// A code from a link or read aloud in a depot. Uppercase, no punctuation, and
// short — anything else is somebody playing with the address bar.
export const tidyCode = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const clean = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  return clean.length >= 4 ? clean : null;
};

// Kept on the device the same way a flyer's tag is: someone arrives from a
// friend's link and makes an account minutes or days later, long after the
// address has lost its query string.
export function rememberInvite(search: string) {
  const code = tidyCode(new URLSearchParams(search).get("invite"));
  if (!code) return;
  try {
    if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, code);
  } catch {
    // A locked-down browser simply misses the bonus.
  }
}

export function readInvite(): string | null {
  try {
    return tidyCode(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function forgetInvite() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to forget.
  }
}

export type ClaimResult = { claimed: boolean; reason?: string };

// Called once, just after an account is made. Records who brought whom and
// pays nothing; the bonus comes later, when a document is actually read.
export async function claimInvite(code: string): Promise<ClaimResult> {
  try {
    const { data, error } = await supabase.rpc("claim_invite", { p_code: code });
    if (error) return { claimed: false, reason: "failed" };
    return (data as ClaimResult) ?? { claimed: false, reason: "failed" };
  } catch {
    return { claimed: false, reason: "failed" };
  }
}

export async function myInviteCode(): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("my_invite_code");
    if (error || typeof data !== "string") return null;
    return data;
  } catch {
    return null;
  }
}

// What the app says about a refusal. None of these are errors: a wrong code or
// a second try is an ordinary thing to do, and blaming somebody for it on the
// day they join is a poor start.
export function claimMessage(r: ClaimResult): string | null {
  if (r.claimed) return "Your friend's invite is on your account. Scan one document and you both get 300 extra.";
  switch (r.reason) {
    case "unknown":
      return "We couldn't find that invite code. No matter — everything works the same without it.";
    case "already":
      return null;
    case "self":
      return "That's your own code. Send it to somebody else and you both get 300 extra.";
    default:
      return null;
  }
}
