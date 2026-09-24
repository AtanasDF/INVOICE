// The app at the text size somebody has already chosen on their phone.
//
// iOS's Dynamic Type goes up to 53px, about three times the default, and
// people who turn it up have turned it up for a reason. Not one of the
// twelve apps in notes/competitor-research.md claims to respect it -- and
// for an app whose brief is that "three old kids should be able to do
// that", ignoring a setting somebody already changed is the plainest
// failure there is.
//
// NOT IN run-all.sh: 21 of its 22 pass. What is left is the issued
// invoice, 36px over a 390px screen -- the table is in a scroll box and
// behaves; something else on that page is 426px wide and has not been
// found yet. The Dynamic Type rule in globals.css stays commented out
// until it is, and then both go live together.
//
// Was: fails on purpose. It is the target for work
// that is not done: at twice the text size the dashboard panels, the
// invoice table, the receipt action rows and the expenses picker all run
// off the side of a 390px screen. The Dynamic Type rule in globals.css is
// commented out until they do not -- turning it on first would make the
// app worse for exactly the people who turned the size up. When these all
// pass, the rule goes live and this joins the run, in one commit.
//
// globals.css takes the size from -apple-system-body, which is Safari-only,
// so Chrome never runs that rule and this suite cannot test the MECHANISM.
// It tests the consequence instead, by setting the root size directly:
// whether the screens still work when the type is twice the size. That is
// the part that breaks, and it breaks the same way whatever set the size.
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
db.tables.invoices.push({ id: INV, user_id: "x", client_id: C, date: day(-40), number: "INV-000001", items: [{ description: "Replaster the lounge ceiling", quantity: 1, unitPrice: 1250, vatRate: "standard" }], notes: "", due_date: day(-12), payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: null });
db.tables.receipts.push({ id: newId(), user_id: "x", client_id: null, date: day(-4), vendor: "Jewson", category: "Supplies", amount: 200, vat_amount: 40, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "invoice", invoice_number: "J-1", due_date: day(-2), paid: false, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });

const PAGES = [
  ["/", "Dashboard"],
  ["/money", "Money"],
  ["/invoices", "Invoices"],
  [`/invoices/${INV}`, "One invoice"],
  ["/receipts", "Receipts & bills"],
  ["/clients", "Customers & suppliers"],
  ["/expenses", "Expenses"],
  ["/vat", "VAT"],
  ["/settings", "Settings"],
  ["/jobs", "Jobs"],
];

// 32px root: twice the default, which is where iOS's ordinary (non-
// accessibility) sizes top out.
const BIG = 32;
// evaluateOnNewDocument runs before the document exists on some
// navigations, so the size is set as soon as there is something to set it
// on rather than assuming there already is.
const setBig = (page) => page.evaluateOnNewDocument((px) => {
  const apply = () => document.documentElement && (document.documentElement.style.fontSize = `${px}px`);
  if (!apply()) document.addEventListener("DOMContentLoaded", apply, { once: true });
}, BIG);

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-big-text" });
try {
  await signIn(page, BASE);
  await setBig(page);

  for (const [path, name] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
    await sleep(1100);

    const root = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    if (name === "Dashboard") check(`the text really is twice the size (${root}px)`, root >= BIG - 1, `${root}px`);

    // Nothing may run off the side: that is what turns "big text" into
    // "half the screen is missing".
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    // Name the element that actually WIDENS THE PAGE, not merely the one
    // furthest right: a table inside a scroll box is supposed to stick out,
    // and listing it buried the real culprit every time.
    const sticking = fits ? [] : await page.evaluate(() => {
      const w = window.innerWidth;
      const scrollable = (el) => {
        for (let n = el.parentElement; n; n = n.parentElement) {
          const o = getComputedStyle(n).overflowX;
          if (o === "auto" || o === "scroll" || o === "hidden") return true;
        }
        return false;
      };
      return [...document.querySelectorAll("*")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > w + 1 && !scrollable(el);
        })
        // The deepest one is the thing itself rather than a parent stretched
        // by it.
        .map((el) => { let d = 0; for (let n = el; (n = n.parentElement); ) d++; return { el, d }; })
        .sort((a, b) => b.d - a.d)
        .slice(0, 3)
        .map(({ el }) => `${el.tagName}.${(el.className || "").toString().slice(0, 34)} :: ${(el.textContent || "").trim().slice(0, 30)}`);
    });
    check(`${name}: nothing runs off the side at twice the text size`, fits, JSON.stringify(sticking));

    // A figure cut in half is a wrong figure to whoever reads it. Only text
    // that is really LOST counts: clipped or ellipsised. Text that merely
    // spills past its box is still readable, and flagging it buried the
    // cases where a total is actually unreadable.
    const cut = await page.evaluate(() =>
      [...document.querySelectorAll("span, td, dd, p, strong, div, h1, h2, button, a")]
        .filter((el) => el.children.length === 0 && el.textContent.trim())
        .filter((el) => {
          if (el.scrollWidth <= el.clientWidth + 1) return false;
          // sr-only is a 1px clipped box on purpose: it is there to be READ
          // OUT, not looked at, so it is always "clipped" and never a loss.
          if (el.closest(".sr-only") || el.classList.contains("sr-only")) return false;
          const s = getComputedStyle(el);
          return s.overflow === "hidden" || s.overflowX === "hidden" || s.textOverflow === "ellipsis";
        })
        .map((el) => el.textContent.trim().slice(0, 30))
        .slice(0, 4));
    check(`${name}: no words or figures are cut off`, cut.length === 0, JSON.stringify(cut));
  }

  // The one that matters most: the buttons still work, and nothing has
  // been pushed under anything else.
  await page.goto(`${BASE}/money`, { waitUntil: "networkidle0" });
  await sleep(1000);
  const reachable = await page.evaluate(() => {
    const out = [];
    for (const b of document.querySelectorAll("button, a[href]")) {
      const r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Inside a menu that is shut: laid out, but nobody is looking at it
      // and it is not meant to be tappable until the menu is opened.
      const details = b.closest("details");
      if (details && !details.open) continue;
      if (r.bottom < 0 || r.top > window.innerHeight) continue;
      const mid = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      if (mid && !b.contains(mid) && !mid.contains(b)) out.push(`${(b.textContent || "").trim().slice(0, 24)}`);
    }
    return out.slice(0, 4);
  });
  check("every button can still be tapped, nothing is buried under anything", reachable.length === 0, JSON.stringify(reachable));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
