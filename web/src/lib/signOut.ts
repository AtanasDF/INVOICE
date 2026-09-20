import { showOnAppIcon } from "@/lib/appBadge";
import { disablePush } from "@/lib/push";
import { pushSubscriptionsStore } from "@/lib/storage";
import { AUTH_STORAGE_KEY, supabase } from "@/lib/supabaseClient";

// Signing out has to take this device's push notifications with it.
//
// Nothing used to. The browser stayed subscribed and the push_subscriptions
// row went on pointing at the account, so the daily cron kept pushing
// "2 overdue invoices and 1 bill due soon" to the lock screen of a device
// nobody was signed in on, and the count stayed on the home-screen icon.
// On a borrowed, lent or sold phone that is someone else's business
// appearing on the screen every morning.
//
// It also left the Settings switch lying: that switch reads the BROWSER's
// subscription, not the row, so whoever signed in next saw notifications
// already "on" with nothing of their own behind them -- and turning them
// off deleted no row, because RLS scoped the delete to the new account.
//
// Order matters: the row can only be deleted while the session that owns
// it still exists, so the cleanup happens before signOut(). None of it may
// stop the sign-out -- a failed cleanup is a nuisance, not being able to
// sign out is not -- so it is best-effort and signOut() sits in `finally`.
// supabase-js RETRIES a failed token refresh, so on a dead connection the
// call below sits there for a long time -- the button does nothing, says
// nothing, and there is no way to tell it apart from a tap that missed.
// Past this, the session comes off the device and the server catches up
// whenever it can.
const SIGN_OUT_TIMEOUT_MS = 4000;

export async function signOut(): Promise<void> {
  try {
    showOnAppIcon(0);
    const endpoint = await disablePush();
    if (endpoint) await pushSubscriptionsStore.unsubscribe(endpoint);
  } catch {
    // Offline, permission already revoked, no service worker -- sign out anyway.
  }

  // The loser of the race isn't cancelled, which is what we want: if the
  // logout does eventually reach Supabase, the session is revoked there too.
  await Promise.race([
    supabase.auth.signOut(),
    new Promise((resolve) => setTimeout(resolve, SIGN_OUT_TIMEOUT_MS)),
  ]);

  // Don't take its word for it, and don't assume it ever answered. supabase.auth.signOut() RESOLVES with an
  // error rather than throwing; on a phone whose access token expired while
  // the refresh call can't get through it can come back reporting NO error
  // at all and leave the stored session exactly where it was, and it can
  // equally never come back at all. Either way no SIGNED_OUT fires,
  // nothing routes away, and the header still reads Invoices / Settings.
  // The button did nothing and said nothing. Lend that phone to someone
  // and they have the whole accounting record.
  //
  // So the question asked here is the only one that matters -- is this
  // device still signed in? -- and it is answered by looking.
  let stillSignedIn = false;
  try {
    stillSignedIn = localStorage.getItem(AUTH_STORAGE_KEY) !== null;
  } catch {
    // storage blocked -- nothing was stored to leave behind
  }
  if (!stillSignedIn) return;

  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // storage blocked -- the load below still rebuilds the client
  }
  // A full document load, not router.push: the point is to rebuild the
  // Supabase client with nothing in storage. replace() so Back doesn't
  // return to a page that looks signed in. Offline this ends the session
  // on this device only -- the refresh token can't be revoked server-side
  // without a connection, which is no worse than before and is what a
  // borrowed phone needs.
  window.location.replace(new URL("/login", window.location.origin).toString());
}
