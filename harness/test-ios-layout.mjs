// What brief 13's iPhone fixes look like in a browser, as near to the phone
// as Chrome gets (notes/ios-safari.md #1, #2, #5, #21, #23).
//
// test-ios-forms-layout pins each fix in the source; this one checks the
// layout they produce. Chrome cannot zoom into a box, has no Dynamic Island
// and no aA menu, so three stand-ins are used, each named where it is used:
// a touch-screen viewport (pointer: coarse), a 32px root (iOS's larger text,
// as test-big-text does it), and a 195px-wide viewport, which is how Safari's
// aA 200% page zoom lays a 390-point phone out.
import { makeDb, launchSignedIn, signIn, sleep, newId, day, clickText } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, address: "1 Test Street", custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "a@b.c", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const DRAFT = newId();
db.tables.invoices.push({ id: DRAFT, user_id: "x", client_id: C, date: day(-1), number: null, items: [{ description: "Replaster the lounge ceiling", quantity: 1, unitPrice: 1250, vatRate: "standard" }], notes: "", due_date: day(29), payment_terms: "", status: "draft", tags: [], vat_registered: null, cis_rate: null });

const settle = async (page, path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
  await sleep(900);
};
const widens = (page) => page.evaluate(() => {
  const w = window.innerWidth;
  if (document.documentElement.scrollWidth <= w + 1) return [];
  const scrollable = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const o = getComputedStyle(n).overflowX;
      if (o === "auto" || o === "scroll" || o === "hidden") return true;
    }
    return false;
  };
  return [...document.querySelectorAll("*")]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > w + 1 && !scrollable(el); })
    .map((el) => { let d = 0; for (let n = el; (n = n.parentElement); ) d++; return { el, d }; })
    .sort((a, b) => b.d - a.d)
    .slice(0, 3)
    .map(({ el }) => `${el.tagName}.${(el.className || "").toString().slice(0, 40)} :: ${(el.textContent || "").trim().slice(0, 24)}`);
});
const touch = (page, width, height = 780) => page.setViewport({ width, height, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-ios-layout" });
try {
  await signIn(page, BASE);
  await touch(page, 390);

  // --- #1: no box under 16px on a touch screen ---
  await settle(page, "/receipts/new");
  const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  check("(the stand-in really is a touch screen)", coarse);
  await clickText(page, "+ Split into multiple items");
  await sleep(300);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("main input:not([type=checkbox]):not([type=radio]):not([type=file]), main select, main textarea")]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => [el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.id || el.tagName, parseFloat(getComputedStyle(el).fontSize)])
      .filter(([, px]) => px < 16));
  check("#1 every box on New receipt is at least 16px on a touch screen, so iOS doesn't zoom", small.length === 0, JSON.stringify(small));

  // --- #2: the decimal point ---
  const price = await page.$('input[aria-label="Price"]');
  await price.click({ clickCount: 3 });
  await price.type("2.50");
  await sleep(200);
  check("#2 a receipt line takes 2.50 as typed", (await page.evaluate((el) => el.value, price)) === "2.50", await page.evaluate((el) => el.value, price));
  check("#2 ...with the number keyboard", (await page.evaluate((el) => el.inputMode, price)) === "decimal");

  // --- #23 and #5: no floating Feedback pill on a phone at all (2026-10-28) ---
  // It sat over the bottom-right of every screen; on a phone Feedback is in
  // the menu and the footer instead.
  const pillShown = () => page.evaluate(() => {
    const a = [...document.querySelectorAll("a")].find((x) => x.textContent.trim() === "Feedback" && getComputedStyle(x).position === "fixed");
    return a ? getComputedStyle(a).display !== "none" : false;
  });
  check("#23 no Feedback pill floats over a phone screen", (await pillShown()) === false);
  check("#23 ...Feedback is in the footer instead", await page.evaluate(() => [...document.querySelectorAll("footer a")].some((x) => x.textContent.trim() === "Feedback" && x.getAttribute("href") === "/feedback")));

  // --- #23: + Add (on the invoices list) holds the page still behind it ---
  await settle(page, "/invoices");
  await clickText(page, "+ Add");
  await sleep(400);
  check("#23 ...and the page behind it does not scroll", (await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)) === "hidden");
  await clickText(page, "Cancel").catch(() => page.keyboard.press("Escape"));

  // --- #21: + Add and the Free page at iOS's larger text ---
  await page.evaluateOnNewDocument(() => {
    const apply = () => document.documentElement && (document.documentElement.style.fontSize = "32px");
    if (!apply()) document.addEventListener("DOMContentLoaded", apply, { once: true });
  });
  await touch(page, 390, 664);
  await settle(page, "/invoices");
  await clickText(page, "+ Add");
  await sleep(400);
  const sheet = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"][aria-label="Add"]');
    if (!d) return null;
    const r = d.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, h: innerHeight, scrolls: d.scrollHeight > d.clientHeight && getComputedStyle(d).overflowY === "auto" };
  });
  check("#21 at twice the text size + Add fits the screen, top and bottom", !!sheet && sheet.top >= -1 && sheet.bottom <= sheet.h + 1, JSON.stringify(sheet));
  check("#21 ...and scrolls inside itself to reach the rest", !!sheet?.scrolls, JSON.stringify(sheet));
  await page.keyboard.press("Escape");

  await settle(page, "/free-invoice");
  // The bar belongs to the editor, which opens from the start screen.
  await page.evaluate(() => [...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === "Type it in")?.click());
  await sleep(500);
  const bar = await page.evaluate(() => {
    const b = document.querySelector(".fixed.inset-x-0.bottom-0");
    if (!b) return null;
    return [...b.querySelectorAll(":scope > button")].map((x) => { const r = x.getBoundingClientRect(); return [x.textContent.trim(), Math.round(r.left), Math.round(r.right)]; });
  });
  check("#21 at twice the text size every button on the Free page's bar is on the screen",
    !!bar && bar.length >= 4 && bar.every(([, l, r]) => l >= -1 && r <= 391), JSON.stringify(bar));

  // --- #21: Safari's aA at 200% ---
  const { browser: b2, page: z } = await launchSignedIn(db, { base: BASE, width: 195, profile: "profile-ios-layout-zoom" });
  try {
    await signIn(z, BASE);
    await touch(z, 195, 390);
    for (const [path, name, prep] of [
      ["/invoices/new", "New invoice", null],
      [`/invoices/${DRAFT}`, "A draft invoice", null],
      ["/quotes/new", "New quote", null],
      ["/receipts/new", "New receipt with a line", "+ Split into multiple items"],
    ]) {
      await settle(z, path);
      if (prep) { await clickText(z, prep).catch(() => {}); await sleep(300); }
      const out = await widens(z);
      check(`#21 ${name}: nothing runs off the side at Safari's 200% page zoom`, out.length === 0, JSON.stringify(out));
    }
  } finally {
    await b2.close();
  }
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close().catch(() => {}); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
