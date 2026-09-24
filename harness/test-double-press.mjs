// Pressing a button twice in the same tick. React applies `disabled` on the
// render AFTER the first press, and both handlers close over the same state,
// so two presses in one tick both go through. Every one of these writes to
// the accounting record: two expenses for one trip, one bill logged twice, a
// second draft invoice to the same customer, a merge run twice.
//
// A cold thumb on a phone, or a page that has just gone busy, is how this
// happens in real life -- it is not a contrived double-click.
import { makeDb, launchSignedIn, signIn, sleep, newId, todayISO, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// Both clicks in one page.evaluate, so they land in the same tick with no
// render between them -- which is exactly what `disabled` cannot catch.
const pressTwice = (page, label) => page.evaluate((l) => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === l && !x.disabled);
  if (!b) throw new Error("no button: " + l);
  b.click();
  b.click();
}, label);

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });

const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "a@b.c", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const S = newId();
db.tables.clients.push({ id: S, user_id: "x", name: "Jewson", email: "", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
// A duplicate pair for the merge.
const DUP = newId();
db.tables.clients.push({ id: DUP, user_id: "x", name: "Jewson ", email: "", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });

db.tables.recurring_invoices.push({ id: newId(), user_id: "x", client_id: C, description: "Monthly maintenance", items: [{ description: "Maintenance", quantity: 1, unitPrice: 200, vatRate: "standard" }], notes: "", payment_terms: "14 days", next_due_date: day(-1), active: true });
db.tables.recurring_expenses.push({ id: newId(), user_id: "x", client_id: S, description: "Van insurance", category: "Insurance", amount: 60, vat_amount: 12, next_due_date: day(-1), active: true });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-double-press" });
// Merging asks first. Without this the confirm blocks the page and the next
// evaluate times out rather than failing a check.
page.on("dialog", (d) => d.accept().catch(() => {}));
try {
  await signIn(page, BASE);

  // ── A recurring invoice: two drafts to one customer ──
  await page.goto(`${BASE}/recurring/invoices`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Make it now"), { timeout: 20000 });
  await pressTwice(page, "Make it now");
  await sleep(2500);
  check("recurring invoice: two presses make one draft, not two", db.tables.invoices.length === 1, JSON.stringify(db.tables.invoices.map((i) => i.number)));
  // And the button must still work afterwards: a guard that never releases
  // is a worse bug than the one it fixes.
  await page.goto(`${BASE}/recurring/invoices`, { waitUntil: "networkidle0" });
  await sleep(1500);
  const again = await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Make it now"));
  check("the reminder has moved on, so it isn't offered again today", !again, String(again));

  // ── A recurring expense: one bill logged twice ──
  await page.goto(`${BASE}/recurring`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Log it"), { timeout: 20000 });
  await pressTwice(page, "Log it");
  await sleep(2500);
  check("recurring expense: two presses log one expense, not two", db.tables.receipts.length === 1, JSON.stringify(db.tables.receipts.map((r) => [r.vendor, r.amount])));

  // ── Mileage: one trip claimed twice ──
  await page.goto(`${BASE}/mileage`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Save the trip"), { timeout: 20000 });
  await page.evaluate(() => {
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
    const miles = [...document.querySelectorAll("input")].find((i) => (i.getAttribute("aria-label") ?? "").toLowerCase().includes("mile") || i.placeholder === "0");
    if (miles) set(miles, "120");
  });
  await sleep(600);
  const before = db.tables.receipts.length;
  await pressTwice(page, "Save the trip");
  await sleep(2500);
  check("mileage: two presses claim the trip once", db.tables.receipts.length === before + 1, JSON.stringify(db.tables.receipts.filter((r) => r.category === "Mileage").map((r) => r.amount)));

  // ── Merging two records for one business ──
  await page.goto(`${BASE}/clients?tab=supplier`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^Merge into /.test(b.textContent.trim())), { timeout: 20000 });
  const mergeLabel = await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Merge into /.test(b.textContent.trim())).textContent.trim());
  const archivedBefore = db.tables.clients.filter((c) => c.archived).length;
  await pressTwice(page, mergeLabel);
  await sleep(2500);
  check("merge: two presses archive one record, not two", db.tables.clients.filter((c) => c.archived).length === archivedBefore + 1, JSON.stringify(db.tables.clients.map((c) => [c.name, c.archived])));
  check("merge: nothing was deleted", db.tables.clients.length === 3, String(db.tables.clients.length));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
