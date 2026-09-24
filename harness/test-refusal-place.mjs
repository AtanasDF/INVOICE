// Where a refusal appears, on a screen showing several things at once.
//
// Needs review shows the whole queue on one page. A refusal about the third
// bill used to be printed at the TOP of that page: it named no receipt, and
// on a phone -- with the row you pressed scrolled into view -- it was not on
// screen at all, so the button read as dead. Nothing was wrong with the app's
// words; they were in the wrong place, which comes to the same thing.
import { makeDb, launchSignedIn, signIn, sleep, newId, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });

// Three bills waiting, each needing a due date. Long enough that the third
// is well down the page.
const bill = (vendor) => {
  const id = newId();
  db.tables.receipts.push({ id, user_id: "x", client_id: null, date: day(-4), vendor, category: "Supplies", amount: 100, vat_amount: 20, image_data_url: null, notes: "", starred: false, needs_review: true, warranty_months: null, tags: [], line_items: [], document_type: "invoice", invoice_number: `${vendor.slice(0, 3).toUpperCase()}-1`, due_date: null, paid: false, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
  return id;
};
bill("Travis Perkins");
const SECOND = bill("Jewson");
bill("Screwfix");

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-refusal-place" });
page.on("dialog", (d) => d.accept().catch(() => {}));

// The supplier's name is in an input's VALUE, not in the page's text -- it
// is a form, not a list -- so a card is found from that box upwards: the
// nearest ancestor that also holds this receipt's own buttons.
const CARD_FROM_INPUT = `
  const box = [...document.querySelectorAll("input")].find((i) => i.value === V);
  if (!box) return null;
  let card = box;
  while (card && ![...card.querySelectorAll("button")].some((b) => b.textContent.trim() === "Looks good")) card = card.parentElement;
`;

const cardOf = (page, vendor) => page.evaluate(new Function("V", `${CARD_FROM_INPUT}
  if (!card) return null;
  const names = [...card.querySelectorAll("input")].map((i) => i.value);
  return {
    alerts: [...card.querySelectorAll('[role="alert"]')].map((e) => e.textContent.trim()),
    // One supplier name inside it, or it is a wrapper round the whole queue.
    onlyOne: ["Travis Perkins", "Jewson", "Screwfix"].filter((n) => names.includes(n)).length === 1,
  };
`), vendor);

const pressIn = (page, vendor, label) => page.evaluate(new Function("V", "L", `${CARD_FROM_INPUT}
  if (!card) throw new Error("no card for " + V);
  const b = [...card.querySelectorAll("button")].find((x) => x.textContent.trim() === L && !x.disabled);
  if (!b) throw new Error("no button " + L + " in " + V);
  b.click();
`), vendor, label);

try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/receipts/review`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => i.value === "Screwfix"), { timeout: 20000 });

  check("all three are waiting", await page.evaluate(() => {
    const values = [...document.querySelectorAll("input")].map((i) => i.value);
    return ["Travis Perkins", "Jewson", "Screwfix"].every((n) => values.includes(n));
  }));

  await pressIn(page, "Jewson", "Looks good");
  await sleep(1200);

  const jewson = await cardOf(page, "Jewson");
  check("the refusal is inside the row it is about", jewson && jewson.onlyOne && jewson.alerts.some((a) => /needs a due date/.test(a)), JSON.stringify(jewson));

  const others = await Promise.all([cardOf(page, "Travis Perkins"), cardOf(page, "Screwfix")]);
  check("the other two say nothing", others.every((c) => c && c.alerts.length === 0), JSON.stringify(others));

  // It must not be printed at the top as well, or it is in two places and
  // the one at the top still names no receipt.
  const aboveTheList = await page.evaluate(() => {
    const inCards = new Set();
    for (const box of document.querySelectorAll("input")) {
      let card = box;
      while (card && ![...card.querySelectorAll("button")].some((b) => b.textContent.trim() === "Looks good")) card = card.parentElement;
      if (card) for (const a of card.querySelectorAll('[role="alert"]')) inCards.add(a);
    }
    return [...document.querySelectorAll('[role="alert"]')].filter((e) => !inCards.has(e)).length;
  });
  check("and not at the top of the page as well", aboveTheList === 0, String(aboveTheList));

  check("nothing was saved", db.tables.receipts.every((r) => r.needs_review === true), JSON.stringify(db.tables.receipts.map((r) => [r.vendor, r.needs_review])));

  // Typing the due date is the start of a new attempt: the refusal must go.
  await page.evaluate(new Function("V", `${CARD_FROM_INPUT}
    if (!card) throw new Error("no card for " + V);
    // Two date boxes per card -- the document's own date and the due date.
    const el = card.querySelector('input[aria-label="Due date"]');
    if (!el) throw new Error("no due-date box in " + V);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "2026-12-01");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  `), "Jewson");
  await sleep(700);
  const afterTyping = await cardOf(page, "Jewson");
  check("filling the due date clears the refusal about it", afterTyping && afterTyping.alerts.length === 0, JSON.stringify(afterTyping));

  // And it saves.
  await pressIn(page, "Jewson", "Looks good");
  await sleep(2500);
  const saved = db.tables.receipts.find((r) => r.vendor === "Jewson");
  check("and then it saves", saved && saved.needs_review === false && saved.due_date === "2026-12-01", JSON.stringify(saved && [saved.needs_review, saved.due_date]));
  check("the other two are still waiting, untouched", db.tables.receipts.filter((r) => r.needs_review).length === 2, JSON.stringify(db.tables.receipts.map((r) => [r.vendor, r.needs_review])));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
