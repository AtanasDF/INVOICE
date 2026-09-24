// Getting round without a mouse or a thumb. Someone using a keyboard, a
// switch, or a screen reader's own navigation reaches things in DOM order
// and acts on them with Enter or Space -- so anything that only answers a
// click, or that cannot be reached at all, is not there for them.
//
// This is not a theoretical audience: it is also anyone on a laptop with a
// broken trackpad, and it is the same tab order a phone's "next field"
// button walks.
import { makeDb, launchSignedIn, signIn, sleep, newId, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, address: "1 Test Street", custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "a@b.c", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const INV = newId();
db.tables.invoices.push({ id: INV, user_id: "x", client_id: C, date: day(-10), number: "INV-000009", items: [{ description: "Work", quantity: 1, unitPrice: 500, vatRate: "standard" }], notes: "", due_date: day(20), payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: null });
db.tables.receipts.push({ id: newId(), user_id: "x", client_id: null, date: day(-4), vendor: "Jewson", category: "Supplies", amount: 100, vat_amount: 20, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });

const PAGES = [
  ["/", "Dashboard"],
  ["/invoices", "Invoices"],
  [`/invoices/${INV}`, "One invoice"],
  ["/receipts", "Receipts & bills"],
  ["/receipts/review", "Needs review"],
  ["/clients", "Customers & suppliers"],
  ["/quotes", "Quotes"],
  ["/expenses", "Expenses"],
  ["/vat", "VAT"],
  ["/mileage", "Mileage"],
  ["/recurring", "Recurring expenses"],
  ["/files", "File library"],
  ["/settings", "Settings"],
];

// Anything a person can act on must be reachable by Tab and answer a key.
// A <div onClick> is the usual offender: it looks like a button, it is not
// one, and a keyboard never finds it.
const unreachable = (page) => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("div, span, li, td")) {
    // React puts its handler on the element; the property is the tell.
    const hasClick = Object.keys(el).some((k) => k.startsWith("__reactProps")) &&
      !!Object.entries(el).find(([k]) => k.startsWith("__reactProps"))?.[1]?.onClick;
    if (!hasClick) continue;
    // A chart library puts a click handler on its own container for
    // tooltips; that is not something a person acts on, and the figures
    // are given as text beside it instead.
    if (el.closest("[aria-hidden='true']") || el.closest(".recharts-wrapper")) continue;
    const role = el.getAttribute("role") ?? "";
    const focusable = el.tabIndex >= 0;
    const isControl = /^(button|link|tab|radio|checkbox|option|menuitem|switch)$/.test(role);
    if (!focusable || !isControl) {
      out.push(`${el.tagName}${role ? `[role=${role}]` : ""} tabIndex=${el.tabIndex} :: ${(el.textContent || "").trim().slice(0, 40)}`);
    }
  }
  return out;
});

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 1100, profile: "profile-keyboard" });
try {
  await signIn(page, BASE);

  for (const [path, name] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
    await sleep(1100);

    const stranded = await unreachable(page);
    check(`${name}: nothing you can act on is out of a keyboard's reach`, stranded.length === 0, JSON.stringify(stranded.slice(0, 4)));

    // Every focusable thing must show where the focus is. An outline the
    // theme has removed leaves a keyboard user with no idea where they are.
    const invisible = await page.evaluate(() => {
      const out = [];
      for (const el of [...document.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]")].slice(0, 40)) {
        el.focus();
        if (document.activeElement !== el) continue;
        const s = getComputedStyle(el);
        const shows = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
        const ring = s.boxShadow !== "none";
        if (!shows && !ring) out.push(`${el.tagName}:${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}`);
      }
      return out;
    });
    check(`${name}: focus is visible wherever it lands`, invisible.length === 0, JSON.stringify(invisible.slice(0, 4)));
  }

  // Tabbing from the top must reach the page's own content without walking
  // the whole menu every time.
  await page.goto(`${BASE}/invoices`, { waitUntil: "networkidle0" });
  await sleep(900);
  await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur());
  let firstStop = null;
  for (let i = 0; i < 3 && !firstStop; i++) {
    await page.keyboard.press("Tab");
    firstStop = await page.evaluate(() => {
      const a = document.activeElement;
      return a && a !== document.body ? `${a.tagName}:${(a.textContent || a.getAttribute("aria-label") || "").trim().slice(0, 40)}` : null;
    });
  }
  check("the first thing Tab reaches is a skip link or the app's own name", /skip|invoiceover|home/i.test(firstStop ?? ""), String(firstStop));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
