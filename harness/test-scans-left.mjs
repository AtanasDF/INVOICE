// The allowance readout and the wall (queue items 5 and 21), now that
// migration-036 is applied and SCAN_LIMITS is on in production.
//
// The arithmetic itself lives in the database and was exercised in SQL inside a
// rolled-back transaction. What matters here is the half a person sees: that
// they are warned BEFORE the wall rather than stopped without notice, that the
// warning stays quiet while there is plenty left, and that meeting the wall
// offers the one thing worth doing about it.
//
// The mock answers scan_allowance, so every case can be walked without a real
// account ever having to spend 600 documents.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const allowance = (over = {}) => ({
  plan: "free",
  welcome: false,
  usedToday: 0,
  usedThisMonth: 0,
  dayLimit: 50,
  monthLimit: 600,
  topUpUsed: false,
  topUpAvailable: true,
  day: "2026-09-23",
  month: "2026-09",
  ...over,
});

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1 });

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-scans-left" });
// Arriving at /scan with nothing in hand opens the camera, which headless has
// none of. A photograph is handed over first, the way a real tap does it, so
// the page reaches the form where the allowance line lives.
const openScan = async () => {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.evaluate((p) => sessionStorage.setItem("scan-handoff-capture", JSON.stringify({ dataUrl: p, mediaType: "image/png" })), PIXEL);
  await page.goto(`${BASE}/scan`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.length > 120, { timeout: 20000 }).catch(() => {});
  await sleep(1200);
  const t = await bodyText(page);
  // Half the checks below are "it should NOT say X", and an empty page passes
  // every one of those. It did, for a while, because /scan opens the camera
  // when nothing is handed to it. So the page has to prove it rendered before
  // any absence is allowed to count as a result.
  if (!/Already paid|To be paid|supplier|total/i.test(t)) {
    throw new Error("the scan page did not render, so nothing below would mean anything: " + t.slice(0, 120));
  }
  return t;
};

try {
  await signIn(page, BASE);

  // --- quiet while there is plenty ---
  db.allowance = allowance({ usedToday: 3 });
  let t = await openScan();
  check("says nothing when the day has barely started", !/more documents today|documents used/i.test(t), t.slice(0, 300));

  db.allowance = allowance({ usedToday: 30 });
  t = await openScan();
  check("...and still nothing at 30 of 50, which is not worth mentioning", !/more documents today/i.test(t), t.slice(0, 300));

  // --- speaks up before the wall, not at it ---
  db.allowance = allowance({ usedToday: 42 });
  t = await openScan();
  check("warns once a quarter of the day is left", /8 more documents today/.test(t), t.slice(0, 400));

  db.allowance = allowance({ usedToday: 49 });
  t = await openScan();
  check("...and counts down in plain words, singular when it should be", /1 more document today/.test(t) && !/1 more documents/.test(t), t.slice(0, 400));

  db.allowance = allowance({ usedToday: 50 });
  t = await openScan();
  check("at the wall it says when it comes back, not just that it stopped", /starts again tomorrow morning/i.test(t), t.slice(0, 400));

  // --- the month, mentioned only when it is the nearer wall ---
  db.allowance = allowance({ usedToday: 45, usedThisMonth: 580 });
  t = await openScan();
  check("mentions the month only when that is what runs out first", /20 left this month/.test(t), t.slice(0, 400));

  // --- nobody who is paying should ever see a meter ---
  db.allowance = allowance({ plan: "paid", dayLimit: null, monthLimit: null, usedToday: 900 });
  t = await openScan();
  check("a paid account is never shown a count", !/more documents today|left this month/i.test(t), t.slice(0, 300));

  // --- a new account is given room, and told nothing about it ---
  db.allowance = allowance({ welcome: true, dayLimit: 300, monthLimit: null, usedToday: 120 });
  t = await openScan();
  check("a new account's bigger allowance is not nagged about either", !/more documents today/i.test(t), t.slice(0, 300));

  // --- Settings says plainly what the account allows ---
  const openSettings = async () => {
    await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
    await sleep(1400);
    return bodyText(page);
  };

  db.allowance = allowance({ usedToday: 12, usedThisMonth: 240 });
  let st = await openSettings();
  check("Settings says what a free account allows", /What your account allows/.test(st) && /50 documents a day/.test(st) && /600 in a month/.test(st), st.slice(0, 600));
  check("...and what it has used, today and this month", /12 of 50/.test(st) && /240 of 600/.test(st), st.slice(0, 700));
  check("...and that copying and writing by hand never count", /never count/i.test(st), st.slice(0, 700));
  check("...and that the extra 600 is there if needed", /another 600 once, free/i.test(st), st.slice(0, 800));

  db.allowance = allowance({ usedToday: 12, usedThisMonth: 900, topUpUsed: true, topUpAvailable: false, monthLimit: 1200 });
  st = await openSettings();
  check("once the extra is used it says when it comes back", /already had your extra 600/i.test(st) && /starts again on the 1st/i.test(st), st.slice(0, 800));

  db.allowance = allowance({ welcome: true, dayLimit: 300, monthLimit: null, usedToday: 40 });
  st = await openSettings();
  check("a new account is told about its bigger first week", /bigger allowance for your first week/i.test(st) && /300 documents a day/.test(st), st.slice(0, 700));

  db.allowance = allowance({ plan: "paid", dayLimit: null, monthLimit: null, usedToday: 900 });
  st = await openSettings();
  check("a paid account is told it has no limit, and shown no meter", /no limit on what you can photograph/i.test(st) && !/of 50|of 600/.test(st), st.slice(0, 600));

  db.allowance = null;
  st = await openSettings();
  check("with no allowance to read, Settings says nothing about plans at all", !/What your account allows/.test(st), st.slice(0, 400));

  // --- before the migration was run, this function did not exist ---
  db.allowance = null;
  t = await openScan();
  check("with no allowance to read it says nothing rather than complaining", !/more documents|couldn't|error/i.test(t.slice(0, 400)), t.slice(0, 300));
  check("...and the page still works", /scan/i.test(t), t.slice(0, 200));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
