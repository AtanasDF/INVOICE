// Signing out has to take this device's push notifications with it.
//
// It didn't. The browser stayed subscribed and the push_subscriptions row
// kept pointing at the account, so the daily cron went on pushing
// "2 overdue invoices and 1 bill due soon" to the lock screen of a phone
// nobody was signed in on, and the count stayed on the home-screen icon.
// Lend the phone to someone, or sell it, and that is his business showing
// up on their screen every morning.
//
// It also left the Settings switch lying to whoever signed in next: that
// switch reads the BROWSER's subscription, not the row, so they saw
// notifications already "on" with nothing of their own behind them.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const ENDPOINT = "https://push.example.test/sub/abc123";

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], recurring_expenses: [], recurring_invoices: [], push_subscriptions: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Ltd", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1, custom_categories: null });
db.tables.push_subscriptions.push({ id: newId(), user_id: "x", endpoint: ENDPOINT, p256dh: "key", auth_key: "auth" });

// How far into the request log the sign-out call came. Anything the app
// does to the database AFTER this point would be doing it with no session.
let logoutAt = -1;
const { browser, page } = await launchSignedIn(db, {
  base: BASE,
  width: 375,
  profile: "profile-signout",
  intercept: (req, u) => {
    if (!u.pathname.startsWith("/auth/v1/logout")) return false;
    logoutAt = db.log.length;
    req.respond({ status: 204, headers: { "Access-Control-Allow-Origin": "*" }, body: "" });
    return true;
  },
});

// A phone that has push switched on: a registered service worker with a
// live subscription, and a badge showing on the icon.
const bePhoneWithPush = (subscribed) =>
  page.evaluateOnNewDocument((hasSub, endpoint) => {
    window.__unsubscribed = false;
    window.__badgeCleared = false;
    let sub = hasSub
      ? {
          endpoint,
          toJSON: () => ({ endpoint, keys: { p256dh: "key", auth: "auth" } }),
          unsubscribe: () => { window.__unsubscribed = true; sub = null; return Promise.resolve(true); },
        }
      : null;
    const reg = { pushManager: { getSubscription: () => Promise.resolve(sub), subscribe: () => Promise.resolve(sub) } };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: () => Promise.resolve(reg), register: () => Promise.resolve(reg), ready: Promise.resolve(reg) },
    });
    Object.defineProperty(navigator, "clearAppBadge", { configurable: true, value: () => { window.__badgeCleared = true; return Promise.resolve(); } });
    Object.defineProperty(navigator, "setAppBadge", { configurable: true, value: () => Promise.resolve() });
  }, subscribed, ENDPOINT);

const clickSignOut = async () => {
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^\s*Sign out\s*$/i.test(x.textContent ?? ""));
    if (!b) return false;
    b.click();
    return true;
  });
  await sleep(1800);
  return clicked;
};

try {
  await bePhoneWithPush(true);
  await signIn(page, BASE);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(1200);

  check("there is a Sign out button to press", await clickSignOut());

  check("the browser subscription is cancelled", await page.evaluate(() => window.__unsubscribed === true));
  const del = db.log.findIndex((e) => e.key === "DELETE push_subscriptions");
  check("the stored subscription row is deleted", del >= 0, JSON.stringify(db.log.map((e) => e.key)));
  check("...for this device's endpoint, not everything", del >= 0 && decodeURIComponent(db.log[del].search).includes(ENDPOINT), del >= 0 ? db.log[del].search : "");
  // The row can only be deleted while the session that owns it still
  // exists. Cleaning up after signOut() would silently do nothing.
  check("...and before the sign-out, while there is still a session to do it with",
    logoutAt >= 0 && del >= 0 && del < logoutAt, `delete at ${del}, logout at ${logoutAt}`);
  check("the number is taken off the home-screen icon", await page.evaluate(() => window.__badgeCleared === true));
  check("and it actually signed out", /\/login/.test(page.url()) || !/Sign out/.test(await bodyText(page)), page.url());

  // A device that never had push must sign out just the same, not hang on
  // a subscription that isn't there.
  db.log.length = 0;
  logoutAt = -1;
  await bePhoneWithPush(false);
  await signIn(page, BASE);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(1200);
  await clickSignOut();
  check("a device with no notifications signs out anyway", logoutAt >= 0, String(logoutAt));
  check("...and doesn't delete a row it never had", !db.log.some((e) => e.key === "DELETE push_subscriptions"), JSON.stringify(db.log.map((e) => e.key)));
  check("...and nothing fell over", !(await bodyText(page)).includes("Application error"));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
