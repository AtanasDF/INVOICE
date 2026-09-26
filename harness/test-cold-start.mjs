// The first time the scanner is opened on a phone, it downloads the
// page-finder: 13 MB of OpenCV. Until that lands the camera is live and
// nothing is found, which reads as "the scanner shows nothing" (Atanas,
// 2026-09-22). The app says so in words -- and nothing was checking that it
// still does, so it could have gone at any time and nobody would have known
// until somebody stood in a yard holding a receipt.
//
// The download is held open here rather than mocked away: that IS the
// condition being tested.
import { makeDb, launchSignedIn, signIn, sleep, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const fakeCamera = (page) =>
  page.evaluateOnNewDocument(() => {
    navigator.permissions.query = async (d) => (d?.name === "camera" ? { state: "granted", onchange: null } : { state: "prompt", onchange: null });
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement("canvas");
      c.width = 1280; c.height = 720;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#888";
      ctx.fillRect(0, 0, 1280, 720);
      setInterval(() => ctx.fillRect(0, 0, 1280, 720), 100);
      return c.captureStream(10);
    };
  });

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-cold-start" });
await fakeCamera(page);

// The cold start is "the page-finder is here but its runtime has not
// finished starting". Holding the network does not reproduce it: the file is
// served immutable and a second run takes it from the browser's cache, past
// any interception, so the real runtime starts anyway and the screen has
// nothing to say.
//
// The vendor file is a UMD wrapper that assigns window.cv = factory(), and
// the value is a PROMISE of the initialised runtime -- the loader says so in
// its own comment. Setting that global to a promise that never settles,
// before the app runs, is the same state from the app's point of view, and
// the loader takes it (`if (global.cv) return resolve({ cv: global.cv })`)
// without fetching anything.
const holdRuntime = (page) => page.evaluateOnNewDocument(() => {
  window.cv = new Promise(() => {});
});

try {
  await signIn(page, BASE);
  await holdRuntime(page);
  await page.goto(`${BASE}/scan`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!document.querySelector("video"), { timeout: 20000 });
  await sleep(2500);

  check("the camera is live while the page-finder is still starting", await page.evaluate(() => !!document.querySelector("video")));

  const waiting = await page.evaluate(() => document.body.innerText);
  check("while it downloads, the screen says it is getting ready",
    /Getting ready/i.test(waiting), waiting.replace(/\s+/g, " ").slice(0, 250));
  check("and says the first time is the slow one, so it reads as normal",
    /first time/i.test(waiting), waiting.replace(/\s+/g, " ").slice(0, 250));
  check("it does not claim anything is wrong",
    !/unavailable|failed|error|problem/i.test(waiting), waiting.replace(/\s+/g, " ").slice(0, 250));
  // Atanas, 2026-09-26: "Takes ages to start actually scanning." It does not --
  // the shutter works from the moment the camera is live, and nothing in this
  // component is ever disabled. Only the AUTOMATIC lock-on waits for the
  // page-finder to download. Somebody watching a viewfinder that will not fire
  // by itself has no way of knowing that, so the message now says it.
  check("and says you do not have to wait for it",
    /take the photo yourself/i.test(waiting), waiting.replace(/\s+/g, " ").slice(0, 250));

  // Big enough to read at arm's length in daylight, and white on the dark
  // viewfinder rather than the neutral scale, which inverts with the theme.
  const looks = await page.evaluate(() => {
    const el = [...document.querySelectorAll("div")].find((d) => /Getting ready/.test(d.textContent) && d.children.length === 0);
    if (!el) return null;
    const s = getComputedStyle(el);
    return { size: parseFloat(s.fontSize), colour: s.color };
  });
  check("the message is at a readable size, in white on the dark viewfinder",
    looks && looks.size >= 13 && /255,\s*255,\s*255/.test(looks.colour), JSON.stringify(looks));

  // And once it arrives the message goes: a "getting ready" that never
  // clears is worse than none, because it never stops apologising.
  const ready = await browser.newPage();
  await ready.setViewport({ width: 390, height: 900 });
  await fakeCamera(ready);
  await ready.goto(`${BASE}/scan`, { waitUntil: "domcontentloaded" });
  await ready.waitForFunction(() => !!document.querySelector("video"), { timeout: 20000 });
  await ready.waitForFunction(() => !/Getting ready/i.test(document.body.innerText), { timeout: 60000 }).catch(() => {});
  const after = await ready.evaluate(() => document.body.innerText);
  check("once the page-finder is here the message goes", !/Getting ready/i.test(after), after.replace(/\s+/g, " ").slice(0, 200));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
