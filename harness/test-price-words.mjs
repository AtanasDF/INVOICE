// A supplier price with words in it.
//
// The price box's own placeholder invites it -- "per length", "per m2" --
// and "12.50 per length" used to parse to 0. The answer saved, and that
// supplier was cheapest on the line at £0.00 for ever after: the
// comparison picked them, the order list said to buy from them, and
// nothing anywhere said the price had not been read.
//
// parseAmount answers 0 both to an empty box and to words, which is right
// where 0 means "nothing typed" and wrong anywhere a price is judged.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, clickText, newId, UID, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], quote_requests: [], quote_request_suppliers: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Harness Ltd", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1, custom_categories: null });
const S = newId();
db.tables.clients.push({ id: S, user_id: UID, name: "Travis Perkins", email: "tp@example.com", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: false, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const ITEM_A = newId();
const ITEM_B = newId();
const REQ = {
  id: newId(), user_id: UID, title: "Timber and board", created_at: new Date().toISOString(),
  items: [{ id: ITEM_A, description: "4x2 CLS timber, 2.4m", quantity: 40 }, { id: ITEM_B, description: "OSB3 18mm sheet", quantity: 12 }],
  needed_by: day(7), site_address: "", status: "open", choice: null,
};
db.tables.quote_requests.push(REQ);
const ROW = {
  id: newId(), user_id: UID, request_id: REQ.id, supplier_id: S, token: "t".repeat(43), sent_at: new Date().toISOString(),
  status: "waiting", prices: null, delivery: null, vat_included: false, valid_until: null, source: null, document_path: null, previous: null, responded_at: null,
};
db.tables.quote_request_suppliers.push(ROW);

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-price-words" });

// Set the box the way test-cis does it: React tracks the last value it
// wrote, so the native setter plus an input event is what actually
// registers. Clicking and typing left the old text in place -- neither
// triple-click nor cmd+A selects inside these fields under puppeteer.
const typeInto = (index, text) =>
  page.evaluate((i, v) => {
    const el = [...document.querySelectorAll("input")].filter((x) => !x.disabled && (x.type === "text" || !x.type))[i];
    if (!el) return false;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, index, text);

try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/quotes/requests/${REQ.id}`, { waitUntil: "networkidle0" });
  await sleep(2000);
  await clickText(page, "Enter prices");
  await sleep(1200);

  const boxes = await page.evaluate(() => [...document.querySelectorAll("input")].filter((x) => !x.disabled && (x.type === "text" || !x.type)).length);
  check("the price boxes are there", boxes >= 2, String(boxes));

  // The answer the placeholder invites.
  await typeInto(0, "12.50 per length");
  await typeInto(2, "24.90");
  await sleep(400);
  await clickText(page, "Save their prices");
  await sleep(2000);

  const refused = await bodyText(page);
  check("a price with words in it is refused", /just a number/i.test(refused), refused.replace(/\s+/g, " ").slice(0, 400));
  check("...and it says which line, so the supplier can be told", /4x2 CLS timber/.test(refused), refused.replace(/\s+/g, " ").slice(0, 400));
  check("...and nothing was saved", db.tables.quote_request_suppliers[0].status === "waiting" && !db.tables.quote_request_suppliers[0].prices, JSON.stringify(db.tables.quote_request_suppliers[0].prices));

  // The same number, without the words.
  await typeInto(0, "12.50");
  await sleep(400);
  await clickText(page, "Save their prices");
  await sleep(2500);

  const saved = db.tables.quote_request_suppliers[0];
  const p = saved.prices ?? {};
  check("a plain number saves", saved.status === "replied", JSON.stringify({ status: saved.status }));
  check("...as 12.50, not 0", Number(p[ITEM_A]?.price ?? p[ITEM_A]) === 12.5, JSON.stringify(p));
  check("...and the other line is untouched at 24.90", Number(p[ITEM_B]?.price ?? p[ITEM_B]) === 24.9, JSON.stringify(p));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
