// Every hard condition at once.
//
// The suites here each hold one variable: 320px in one, twice the text size
// in another, dark mode in a third, reduce-motion in a fourth, one hand in
// a fifth. Real people are not one variable. The person this app is for is
// on an old phone, in a van, with the text turned up because their eyes are
// not what they were, in dark mode because it is January, one-handed
// because the other hand is holding a receipt.
//
// Nothing here is new ground on its own. What is new is the combination,
// which is where layouts that pass every individual check fall over.
import { makeDb, launchSignedIn, signIn, sleep, newId, day } from "./mockdb.mjs";
import { COLOUR_FN } from "./colour.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "A Very Long Plastering Business Name Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, address: "12 Mill Lane\nBristol\nBS1 4DJ", custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch Construction Ltd", email: "accounts@example.com", kind: "client", archived: false, is_company: true, address: "", vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", reminders_enabled: true, company_number: null });
const INV = newId();
db.tables.invoices.push({ id: INV, user_id: "x", client_id: C, date: day(-9), number: "INV-000009", items: [{ description: "Skim and set two bedrooms, a landing and the stairwell including making good", quantity: 1, unitPrice: 2450.5, vatRate: "standard", kind: "labour" }], notes: "", due_date: day(-2), payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: 20 });
db.tables.receipts.push({ id: newId(), user_id: "x", client_id: null, date: day(-3), vendor: "Travis Perkins Building Supplies Limited", category: "Materials", amount: 1234.56, vat_amount: 246.91, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "invoice", invoice_number: "TP-99881", due_date: day(1), paid: false, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });

// 320px is the narrowest phone still in use; 32px root is twice the normal
// text, which is where iOS's ordinary sizes top out.
const WIDTH = 320;
const BIG = 32;

const PAGES = [["/", "Dashboard"], ["/invoices", "Invoices"], [`/invoices/${INV}`, "One invoice"], ["/receipts", "Receipts"], ["/money", "Money"], ["/help", "How it works"], ["/settings", "Settings"], ["/vat", "VAT"]];

const { browser, page } = await launchSignedIn(db, { base: BASE, width: WIDTH, profile: "profile-worst-phone" });
try {
  await signIn(page, BASE);
  await page.setViewport({ width: WIDTH, height: 568, deviceScaleFactor: 2 });
  // Dark, and less movement, and the text turned up: all three at once.
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: "dark" },
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await page.evaluateOnNewDocument((px) => {
    const apply = () => document.documentElement && (document.documentElement.style.fontSize = `${px}px`);
    if (!apply()) document.addEventListener("DOMContentLoaded", apply, { once: true });
  }, BIG);

  for (const [path, name] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
    await sleep(1200);

    const state = await page.evaluate((COLOUR_SRC) => {
      const { toRgb, contrast, behind } = eval(COLOUR_SRC);
      const w = window.innerWidth;
      const scrollable = (el) => {
        for (let n = el.parentElement; n; n = n.parentElement) {
          const o = getComputedStyle(n).overflowX;
          if (o === "auto" || o === "scroll" || o === "hidden") return true;
        }
        return false;
      };
      const sticking = [...document.querySelectorAll("*")]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > w + 1 && !scrollable(el); })
        .map((el) => { let d = 0; for (let n = el; (n = n.parentElement); ) d++; return { el, d }; })
        .sort((a, b) => b.d - a.d).slice(0, 3)
        // The words too, not just the class: "LABEL.text-xs text-neutral-500"
        // matches a dozen labels on a page and names none of them.
        .map(({ el }) => `${el.tagName}.${(el.className || "").toString().slice(0, 26)} :: ${(el.textContent || "").trim().slice(0, 26)}`);

      // Anything a person has to hit, hidden under something else.
      const buried = [];
      for (const b of document.querySelectorAll("button, a[href]")) {
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const details = b.closest("details");
        if (details && !details.open) continue;
        if (r.bottom < 0 || r.top > window.innerHeight) continue;
        // Scrolled out of view inside a scroller still has an on-screen
        // rect, so elementFromPoint finds whatever is painted there and the
        // control looks "buried" when it is simply not showing. The file
        // library's month roller is three of these, and they were the only
        // thing this check ever reported.
        let clipped = false;
        for (let n = b.parentElement; n && !clipped; n = n.parentElement) {
          const o = getComputedStyle(n);
          if (!/auto|scroll|hidden/.test(o.overflowY + o.overflowX)) continue;
          const p = n.getBoundingClientRect();
          if (r.bottom <= p.top + 1 || r.top >= p.bottom - 1 || r.right <= p.left + 1 || r.left >= p.right - 1) clipped = true;
        }
        if (clipped) continue;
        const mid = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
        if (mid && !b.contains(mid) && !mid.contains(b)) buried.push((b.textContent || "").trim().slice(0, 20));
      }

      // Ink on paper, whatever the theme did. Colours come back as lab()
      // in Tailwind v4, so they are resolved by painting them rather than
      // by matching rgb() -- see colour.mjs.
      const faint = [];
      for (const el of [...document.querySelectorAll("h1,h2,p,span,label,button,a,td,li")].slice(0, 220)) {
        if (el.children.length || !(el.textContent || "").trim()) continue;
        const s = getComputedStyle(el);
        if (s.visibility === "hidden" || s.display === "none") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const fg = toRgb(s.color);
        if (!fg) continue;
        const size = parseFloat(s.fontSize);
        const ratio = contrast(fg, behind(el));
        const need = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700) ? 3 : 4.5;
        if (ratio < need - 0.05) faint.push(`${(el.textContent || "").trim().slice(0, 18)} ${ratio.toFixed(2)}:1`);
      }

      return { sticking, buried, faint: faint.slice(0, 4), dark: getComputedStyle(document.documentElement).getPropertyValue("--paper").trim() };
    }, COLOUR_FN);

    check(`${name}: nothing runs off a 320px screen at twice the text`, state.sticking.length === 0, JSON.stringify(state.sticking));
    check(`${name}: nothing a person must press is buried`, state.buried.length === 0, JSON.stringify(state.buried));
    check(`${name}: every word is readable against what is behind it`, state.faint.length === 0, JSON.stringify(state.faint));
  }

  // Reduce-motion is honoured here too, with everything else going on.
  await page.goto(`${BASE}/help`, { waitUntil: "networkidle0" });
  await sleep(900);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Send an invoice"))?.click());
  await sleep(700);
  const helpText = await page.evaluate(() => document.body.innerText);
  check("a walkthrough offers no player on the worst phone either", !/Play it through/.test(helpText), helpText.slice(0, 160));

  // And the thing somebody actually came to do still works one-handed: the
  // bottom third of a 568px screen is where a thumb reaches.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(1200);
  const reachable = await page.evaluate(() => {
    const h = window.innerHeight;
    const main = [...document.querySelectorAll("main a[href], main button")].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    return { total: main.length, low: main.filter((b) => b.getBoundingClientRect().top > h * 0.45).length };
  });
  check("something to press is within a thumb's reach", reachable.low > 0, JSON.stringify(reachable));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
