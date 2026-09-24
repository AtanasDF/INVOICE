// Every page needs its own name.
//
// Next's App Router announcer reads document.title on a client-side move,
// falls back to the first <h1>, and announces ONLY WHEN THE VALUE CHANGED --
// there is no pathname fallback, unlike the Pages Router. Measured on
// 2026-09-24, 23 of 24 pages in this app shared one title, so moving from
// Invoices to Settings said NOTHING to a screen reader. Silence is the one
// thing a page change must not be.
//
// It also decides what the browser tab says and what the back button's history
// reads like, both of which were 23 identical lines.
//
// Setting document.title from an effect does not work and was tried: Next
// re-applies its own metadata afterwards. Each page has a three-line server
// layout instead.
import { makeDb, launchSignedIn, signIn, sleep, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1 });

const PATHS = ["/", "/scan", "/copy", "/convert", "/invoices", "/invoices/new", "/quotes", "/quotes/new",
  "/quotes/requests", "/clients", "/clients/new", "/receipts", "/receipts/new", "/receipts/review",
  "/expenses", "/mileage", "/vat", "/money", "/files", "/recurring", "/recurring/invoices", "/settings", "/feedback"];

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-page-titles" });

try {
  await signIn(page, BASE);
  const seen = new Map();
  for (const p of PATHS) {
    await page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded" });
    await sleep(500);
    const t = await page.title();
    if (!seen.has(t)) seen.set(t, []);
    seen.get(t).push(p);
  }
  const shared = [...seen.entries()].filter(([, v]) => v.length > 1);
  check("no two pages share a title, or the move between them is silent", shared.length === 0, JSON.stringify(shared.slice(0, 3)));
  check("every page has one", [...seen.keys()].every((t) => t && t.trim().length > 3), JSON.stringify([...seen.keys()].slice(0, 3)));
  check("...and every one still carries the app's name", [...seen.keys()].every((t) => /Invoiceover/.test(t)), JSON.stringify([...seen.keys()].slice(0, 3)));
  check("...and says what the page is before the name, not after", [...seen.keys()].filter((t) => !/^Invoiceover/.test(t)).length >= PATHS.length - 1, JSON.stringify([...seen.keys()].slice(0, 3)));

  // The announcer itself: it lives in a shadow root, so an ordinary query for
  // live regions finds nothing at all and would say this was fine.
  const announcer = await page.evaluate(() => {
    const found = [];
    const walk = (root) => {
      for (const el of root.querySelectorAll("*")) {
        if (el.matches('[aria-live],[role="alert"],[role="status"]')) found.push({ live: el.getAttribute("aria-live"), role: el.getAttribute("role") });
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(document);
    return found;
  });
  check("there is something to announce a page change with", announcer.length > 0, JSON.stringify(announcer.slice(0, 3)));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
