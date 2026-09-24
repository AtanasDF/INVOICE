// What the app promises when there is no signal, and what it must never do.
// The dangerous half is not the offline page: it is caching. A page in this
// app shows somebody's own money, so a cached copy served later is a figure
// that was true once -- an invoice marked paid an hour ago showing as still
// owed is worse than a page that admits it cannot load.
//
// Read from the service worker itself, since that file is plain JavaScript
// served as-is and no bundler or type-checker ever looks at it.
import fs from "fs";
import { makeDb, launchSignedIn, signIn, sleep, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const sw = fs.readFileSync("/Users/nasko/Desktop/INVOICE/web/public/sw.js", "utf8");

check("the API is never cached, whatever else is", /startsWith\("\/api\/"\)\s*\)\s*return;/.test(sw.replace(/\s+/g, " ").replace(/ /g, " ")) || /\/api\//.test(sw), "no rule about /api/");
check("a page is fetched from the network first, every time", /navigate/.test(sw) && /fetch\(req\)\.catch/.test(sw), "pages are not network-first");
check("...and only a failed fetch falls back to the offline page", /catch\(\(\) => caches\.match\(OFFLINE\)/.test(sw), "no offline fallback on a failed navigation");
check("only content-hashed files are served from the cache", /_next\/static\//.test(sw) && /vendor\//.test(sw), "static rule missing");
check("the cache is versioned, and old versions are deleted", /const CACHE = "[^"]+-v\d+"/.test(sw) && /caches\.delete/.test(sw), sw.match(/const CACHE = "[^"]*"/)?.[0] ?? "no CACHE name");
check("nothing but GET is touched", /req\.method !== "GET"/.test(sw), "no method guard");
check("another origin is left alone", /url\.origin !== self\.location\.origin/.test(sw), "no origin guard");

// The rule that matters most, said as a rule: no page path is listed for
// precaching. addAll on install must be the offline page and icons only --
// a screen added to it would be served stale for ever.
const install = sw.slice(sw.indexOf("install"), sw.indexOf("activate"));
const precached = install.match(/"\/[^"]*"/g) ?? [];
check("no screen is precached: only the offline page and the icons",
  precached.every((p) => /icon-|OFFLINE/.test(p) || p === '"/offline"'),
  JSON.stringify(precached));

// ── And in a browser, with the network taken away ──
const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-offline-rules" });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/money`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Owed to you"), { timeout: 20000 });
  const registered = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker?.getRegistration();
    return !!reg;
  });
  check("a service worker is registered on a signed-in page", registered, String(registered));

  if (registered) {
    // Wait for it to take control, then pull the plug.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await sleep(800);
    const cdp = await page.createCDPSession();
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await page.goto(`${BASE}/money`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await sleep(1200);
    const offlineText = await page.evaluate(() => document.body.innerText);
    check("with no signal, a page says so rather than showing an old one",
      !/Owed to you/.test(offlineText), offlineText.replace(/\s+/g, " ").slice(0, 200));
    check("and what it says is for a person, not a browser error",
      /offline|no signal|connection|internet/i.test(offlineText), offlineText.replace(/\s+/g, " ").slice(0, 200));
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  }
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
