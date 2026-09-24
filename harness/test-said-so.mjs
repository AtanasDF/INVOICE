// What a screen says when the thing WORKED. Every one of these screens told
// you when it failed and nothing at all when it succeeded: the row simply
// went, or the form emptied itself. That is clear enough to look at and
// silent to a screen reader, which is told only that something it had been
// reading has disappeared (WCAG 2.2 AA, 4.1.3 Status Messages).
//
// And each of these makes a record somewhere else -- a draft invoice, an
// expense -- which you were then left with no way to reach.
import { makeDb, launchSignedIn, signIn, sleep, newId, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// role="status" is the polite one: it is read out without interrupting, which
// is what "it worked" deserves. role="alert" interrupts, and is for refusals.
const status = (page) => page.evaluate(() =>
  [...document.querySelectorAll('[role="status"]')].map((e) => ({ text: e.textContent.trim(), links: [...e.querySelectorAll("a")].map((a) => a.getAttribute("href")) })).filter((s) => s.text));
const press = (page, label) => page.evaluate((l) => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === l && !x.disabled);
  if (!b) throw new Error("no button: " + l);
  b.click();
}, label);

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "a@b.c", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const S = newId();
db.tables.clients.push({ id: S, user_id: "x", name: "Jewson", email: "", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
db.tables.clients.push({ id: newId(), user_id: "x", name: "Jewson ", email: "", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
db.tables.recurring_invoices.push({ id: newId(), user_id: "x", client_id: C, description: "Monthly maintenance", items: [{ description: "Maintenance", quantity: 1, unitPrice: 200, vatRate: "standard" }], notes: "", payment_terms: "14 days", next_due_date: day(-1), active: true });
db.tables.recurring_expenses.push({ id: newId(), user_id: "x", client_id: S, description: "Van insurance", category: "Insurance", amount: 60, vat_amount: 12, next_due_date: day(-1), active: true });
db.tables.receipts.push({ id: newId(), user_id: "x", client_id: null, date: day(-3), vendor: "Travis Perkins", category: "Supplies", amount: 100, vat_amount: 20, image_data_url: null, notes: "", starred: false, needs_review: true, warranty_months: null, tags: [], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-said-so" });
page.on("dialog", (d) => d.accept().catch(() => {}));

try {
  await signIn(page, BASE);

  // ── A draft invoice made from a schedule ──
  await page.goto(`${BASE}/recurring/invoices`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Make it now"), { timeout: 20000 });
  check("nothing is announced before you press it", (await status(page)).length === 0, JSON.stringify(await status(page)));
  await press(page, "Make it now");
  await sleep(2200);
  const madeSaid = await status(page);
  check("recurring invoice: says the draft was made, and for whom",
    madeSaid.some((s) => /Draft invoice made for Acme Kitchens Ltd/.test(s.text)), JSON.stringify(madeSaid));
  const draftId = db.tables.invoices[0]?.id;
  check("and links to the very invoice it just made",
    madeSaid.some((s) => s.links.includes(`/invoices/${draftId}`)), JSON.stringify({ said: madeSaid, draftId }));

  // ── An expense logged from a reminder ──
  await page.goto(`${BASE}/recurring`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Log it"), { timeout: 20000 });
  await press(page, "Log it");
  await sleep(2200);
  const loggedSaid = await status(page);
  check("recurring expense: says what was logged", loggedSaid.some((s) => /Van insurance logged as an expense/.test(s.text)), JSON.stringify(loggedSaid));
  check("and offers the way to it", loggedSaid.some((s) => s.links.includes("/receipts")), JSON.stringify(loggedSaid));

  // ── A trip claimed ──
  await page.goto(`${BASE}/mileage`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Save the trip"), { timeout: 20000 });
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("input")].find((i) => (i.getAttribute("aria-label") ?? i.previousElementSibling?.textContent ?? "") === "Miles");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "120");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(600);
  await press(page, "Save the trip");
  await sleep(2200);
  const tripSaid = await status(page);
  check("mileage: says the trip was saved, with what it is worth",
    tripSaid.some((s) => /120 miles saved as an expense/.test(s.text) && /£/.test(s.text)), JSON.stringify(tripSaid));
  check("and offers the way to the expenses", tripSaid.some((s) => s.links.includes("/expenses")), JSON.stringify(tripSaid));

  // ── A receipt checked off the review queue ──
  await page.goto(`${BASE}/receipts/review`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Looks good"), { timeout: 20000 });
  await press(page, "Looks good");
  await sleep(2200);
  const reviewSaid = await status(page);
  check("needs review: says which document was saved", reviewSaid.some((s) => /Travis Perkins saved to your records/.test(s.text)), JSON.stringify(reviewSaid));
  check("and offers the way to it", reviewSaid.some((s) => s.links.includes("/receipts")), JSON.stringify(reviewSaid));

  // ── Two records for one business merged ──
  await page.goto(`${BASE}/clients?tab=supplier`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^Merge into /.test(b.textContent.trim())), { timeout: 20000 });
  const mergeLabel = await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Merge into /.test(b.textContent.trim())).textContent.trim());
  await press(page, mergeLabel);
  await sleep(2500);
  const mergeSaid = await status(page);
  check("merge: the result is announced, not just printed", mergeSaid.some((s) => /Jewson/.test(s.text)), JSON.stringify(mergeSaid));

  // The largest change on the page must not be the quietest: a merge moves
  // records between two contacts and archives one of them.
  check("merge: and it really happened", db.tables.clients.filter((c) => c.archived).length === 1, JSON.stringify(db.tables.clients.map((c) => [c.name, c.archived])));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
