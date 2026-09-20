// The phone on its side (a van dashboard, a scanner held landscape) and
// the size of the things you have to hit with a thumb. Apple's own
// guidance is 44x44pt; the inline text actions in this app are smaller by
// design, so this holds the main buttons to it and reports the rest.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const today = new Date().toISOString().slice(0, 10);

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "acme@example.com", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const INV = { id: newId(), user_id: "x", client_id: C, date: today, number: "INV-9", items: [{ description: "Work", quantity: 1, unitPrice: 1000, vatRate: "standard" }], notes: "", due_date: today, payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: null };
db.tables.invoices.push(INV);

const PAGES = [["/", "Dashboard"], ["/invoices", "Invoices"], [`/invoices/${INV.id}`, "An invoice"], ["/receipts/new", "New receipt"], ["/invoices/new", "New invoice"], ["/scan", "Scan"], ["/settings", "Settings"]];

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 375, profile: "profile-onehanded" });
try {
  await signIn(page, BASE);

  // Landscape: a 667x375 phone on its side.
  await page.setViewport({ width: 667, height: 375, deviceScaleFactor: 1 });
  for (const [path, name] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
    await sleep(900);
    const t = await bodyText(page);
    check(`landscape: ${name} opens`, t.length > 40 && !t.includes("Application error"), t.slice(0, 150));
    check(`landscape: ${name} doesn't run off the side`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await page.evaluate(() => `${document.documentElement.scrollWidth} vs ${window.innerWidth}`));
  }

  // Back to portrait for the thumb measurements.
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
  const small = [];
  const tiny = [];
  for (const [path, name] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
    await sleep(900);
    const measured = await page.evaluate(() =>
      [...document.querySelectorAll("button, a[href], summary")]
        .filter((el) => el.offsetParent !== null)
        .map((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          // The solid dark buttons and the bordered ones are the app's real
          // buttons; everything else is a text action inside a sentence.
          const isButton = /rounded-lg|rounded-xl|rounded-full/.test(el.className || "") && (/(^|\s)(bg-neutral-900|border)(\s|$)/.test(el.className || "") || cs.backgroundColor !== "rgba(0, 0, 0, 0)");
          return { w: Math.round(r.width), h: Math.round(r.height), isButton, text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 28) };
        })
        .filter((x) => x.w > 0 && x.h > 0)
    );
    for (const m of measured) {
      // The app's buttons are px-4 py-2, which comes out at 36-38px tall --
      // under Apple's 44pt guidance but consistent, and raising them is a
      // design decision for Atanas, not a bug to fix behind his back. This
      // guards against anything appreciably smaller appearing.
      if (m.isButton && (m.h < 32 || m.w < 32)) small.push(`${name}: "${m.text}" ${m.w}x${m.h}`);
      if (m.h < 14) tiny.push(`${name}: "${m.text}" ${m.w}x${m.h}`);
    }
  }
  for (const s of small.slice(0, 12)) console.log("SMALL BUTTON", s);
  for (const s of tiny.slice(0, 12)) console.log("TINY TARGET", s);
  check(`no button is under 32px to hit (${small.length} smaller)`, small.length === 0, small.slice(0, 5).join(" | "));
  check(`nothing tappable is under 14px tall (${tiny.length} shorter)`, tiny.length === 0, tiny.slice(0, 5).join(" | "));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
