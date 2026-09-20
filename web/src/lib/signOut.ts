import { showOnAppIcon } from "@/lib/appBadge";
import { disablePush } from "@/lib/push";
import { pushSubscriptionsStore } from "@/lib/storage";
import { supabase } from "@/lib/supabaseClient";

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
export async function signOut(): Promise<void> {
  try {
    showOnAppIcon(0);
    const endpoint = await disablePush();
    if (endpoint) await pushSubscriptionsStore.unsubscribe(endpoint);
  } catch {
    // Offline, permission already revoked, no service worker -- sign out anyway.
  } finally {
    await supabase.auth.signOut();
  }
}
