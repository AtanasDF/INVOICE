// What happens on each screen when the database refuses the write. Three
// things have to be true and none of them is automatic:
//
//   1. A person is told in plain words -- never "XX000", "PGRST116" or the
//      word "mock". Postgres's own wording reached the front door once.
//   2. What they typed is still there. A form that clears itself on failure
//      loses the work and gives no way to retry it.
//   3. There is a way on: the button works again.
//
// And nothing is recorded, so nobody is told it failed when it didn't.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// The words a machine uses. None of these may reach a screen.
const MACHINE = /XX000|PGRST\d*|mock failure|\[object Object\]|undefined|null\b|TypeError|Failed to fetch/;
const shownError = (page) => page.evaluate(() =>
  [...document.querySelectorAll('[role="alert"]')].map((e) => e.textContent.trim()).filter(Boolean).join(" | "));
const canPress = (page, label) => page.evaluate((l) => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === l);
  return !!b && !b.disabled;
}, label);
const press = (page, label) => page.evaluate((l) => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === l && !x.disabled);
  if (!b) throw new Error("no button: " + l);
  b.click();
}, label);

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, address: "1 Test Street", bank_details: "", custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "a@b.c", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const S = newId();
db.tables.clients.push({ id: S, user_id: "x", name: "Jewson", email: "", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
db.tables.recurring_invoices.push({ id: newId(), user_id: "x", client_id: C, description: "Monthly maintenance", items: [{ description: "Maintenance", quantity: 1, unitPrice: 200, vatRate: "standard" }], notes: "", payment_terms: "14 days", next_due_date: day(-1), active: true });
db.tables.recurring_expenses.push({ id: newId(), user_id: "x", client_id: S, description: "Van insurance", category: "Insurance", amount: 60, vat_amount: 12, next_due_date: day(-1), active: true });
// A near-duplicate of Jewson, so the merge offer appears.
db.tables.clients.push({ id: newId(), user_id: "x", name: "Jewson ", email: "", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const REVIEW = newId();
db.tables.receipts.push({ id: REVIEW, user_id: "x", client_id: null, date: day(-3), vendor: "Travis Perkins", category: "Supplies", amount: 100, vat_amount: 20, image_data_url: null, notes: "", starred: false, needs_review: true, warranty_months: null, tags: [], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-write-fails" });
page.on("dialog", (d) => d.accept().catch(() => {}));

// One screen, one refused write, the three questions asked of it.
async function refuses(name, { path, ready, fill, label, table, keep }) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
  await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 20000 }, ready);
  if (fill) { await fill(); await sleep(500); }
  const rowsBefore = (db.tables[table] ?? []).length;
  db.fail[`POST ${table}`] = 1;
  db.fail[`PATCH ${table}`] = 1;
  await press(page, label);
  await sleep(2200);
  const said = await shownError(page);
  check(`${name}: says something, in a person's words`, !!said && !MACHINE.test(said), JSON.stringify(said));
  check(`${name}: nothing was recorded`, (db.tables[table] ?? []).length === rowsBefore, `${(db.tables[table] ?? []).length} vs ${rowsBefore}`);
  if (keep) check(`${name}: what was typed is still there`, await keep(), "the form was cleared");
  check(`${name}: the button can be pressed again`, await canPress(page, label), "still disabled");
  db.fail = {};
}

const setInput = (label, value) => page.evaluate((l, v) => {
  const el = [...document.querySelectorAll("input")].find((i) => (i.getAttribute("aria-label") ?? i.previousElementSibling?.textContent ?? i.placeholder ?? "") === l);
  if (!el) throw new Error("no input: " + l);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}, label, value);

try {
  await signIn(page, BASE);

  await refuses("mileage", {
    path: "/mileage", ready: "Save the trip", label: "Save the trip", table: "receipts",
    fill: async () => { await setInput("Miles", "120"); },
    keep: () => page.evaluate(() => [...document.querySelectorAll("input")].some((i) => i.value === "120")),
  });

  await refuses("recurring expense", { path: "/recurring", ready: "Log it", label: "Log it", table: "receipts" });
  await refuses("recurring invoice", { path: "/recurring/invoices", ready: "Make it now", label: "Make it now", table: "invoices" });
  await refuses("needs review", { path: "/receipts/review", ready: "Looks good", label: "Looks good", table: "receipts" });

  await refuses("settings", {
    path: "/settings", ready: "Business name", label: "Save", table: "business_profile",
    fill: async () => { await setInput("Business name", "Changed Name Ltd"); },
    keep: () => page.evaluate(() => [...document.querySelectorAll("input")].some((i) => i.value === "Changed Name Ltd")),
  });

  // Merging repoints invoices, receipts and quotes and archives the
  // duplicate. A refused write here used to show the database's own words.
  await page.goto(`${BASE}/clients?tab=supplier`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^Merge into /.test(b.textContent.trim())), { timeout: 20000 });
  const mergeLabel = await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Merge into /.test(b.textContent.trim())).textContent.trim());
  const archivedBefore = db.tables.clients.filter((c) => c.archived).length;
  db.fail["PATCH clients"] = 1;
  await press(page, mergeLabel);
  await sleep(2200);
  const mergeSaid = await shownError(page);
  check("merge: says something, in a person's words", !!mergeSaid && !MACHINE.test(mergeSaid), JSON.stringify(mergeSaid));
  check("merge: nothing was archived", db.tables.clients.filter((c) => c.archived).length === archivedBefore, JSON.stringify(db.tables.clients.map((c) => [c.name, c.archived])));
  // Acme, Jewson and the near-duplicate: three, and three after a refusal.
  check("merge: nothing was deleted either", db.tables.clients.length === 3, JSON.stringify(db.tables.clients.map((c) => c.name)));
  check("merge: it can be tried again", await canPress(page, mergeLabel), "still disabled");
  db.fail = {};

  // A quote refused on save must keep the lines somebody typed.
  await page.goto(`${BASE}/quotes/new`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Quote number"), { timeout: 20000 });
  await page.evaluate((id) => {
    const row = [...document.querySelectorAll('[role="radio"]')].find((x) => x.textContent.includes("Acme Kitchens"));
    if (row) row.click();
  }, C);
  await sleep(500);
  await page.evaluate(() => {
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
    const desc = document.querySelector('input[aria-label="What the work or item is"]');
    const price = document.querySelector('input[aria-label="Unit price"]');
    if (desc) set(desc, "Replaster lounge");
    if (price) set(price, "750");
  });
  await sleep(500);
  db.fail["POST quotes"] = 1;
  await press(page, "Save quote");
  await sleep(2200);
  const quoteSaid = await shownError(page);
  check("new quote: says something, in a person's words", !!quoteSaid && !MACHINE.test(quoteSaid), JSON.stringify(quoteSaid));
  check("new quote: nothing was saved", db.tables.quotes.length === 0, String(db.tables.quotes.length));
  check("new quote: the line typed in is still there", await page.evaluate(() => [...document.querySelectorAll("input")].some((i) => i.value === "Replaster lounge")), "the form was cleared");
  check("new quote: it can be tried again", await canPress(page, "Save quote"), "still disabled");
  db.fail = {};

  // The record itself must be untouched by a refused Settings save.
  check("settings: the saved business name is unchanged", db.tables.business_profile[0].business_name === "Harness Plastering Ltd", db.tables.business_profile[0].business_name);
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
