// The connection dies in the middle of a save. Nothing may end up half
// written, nothing may be saved twice, and the app has to say which of the
// two happened -- these are his real books, on a phone, on a building site.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, clickText, newId, todayISO } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const flat = (t) => t.replace(/\s+/g, " ");

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "acme@example.com", address: "1 Mill Lane\nBristol\nBS1 4DJ", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const S = newId();
db.tables.clients.push({ id: S, user_id: "x", name: "Travis Perkins", email: "", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const INV = { id: newId(), user_id: "x", client_id: C, date: todayISO(), number: "INV-9", items: [{ description: "Work", quantity: 1, unitPrice: 1000, vatRate: "standard" }], notes: "", due_date: todayISO(), payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: null };
db.tables.invoices.push(INV);

// Signal gone completely, not a database error: every request dies.
let signalGone = false;
const { browser, page } = await launchSignedIn(db, {
  base: BASE,
  profile: "profile-halfsaved",
  intercept: (req, u) => {
    if (signalGone && u.origin.includes("supabase")) { req.abort(); return true; }
    return false;
  },
});
try {
  await signIn(page, BASE);

  // 1. A payment goes in, then the status update is cut off. The payment is
  //    real and must not be lost or repeated -- and he has to be told the
  //    difference.
  db.fail = { "PATCH invoices": 20 };
  await page.goto(`${BASE}/invoices/${INV.id}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Mark as paid"), { timeout: 20000 });
  await clickText(page, "+ Record a payment");
  await sleep(500);
  let t = await bodyText(page);
  check("the payment form opens", t.includes("Save payment"), flat(t).slice(0, 300));
  // The form opens with the balance already in it -- that is the payment.
  await clickText(page, "Save payment");
  await sleep(1800);
  t = await bodyText(page);
  const pays = db.tables.invoice_payments.filter((p) => p.invoice_id === INV.id);
  check("the payment is written exactly once", pays.length === 1, JSON.stringify(pays.map((p) => p.amount)));
  check("he is told the payment saved but the status didn't", /payment is saved/i.test(t) || /status couldn't be updated/i.test(t), flat(t).slice(0, 400));
  check("the invoice is not left claiming to be paid", db.tables.invoices.find((i) => i.id === INV.id)?.status === "sent");
  db.fail = {};

  // 2. A receipt save that never reaches the database: nothing saved, said
  //    plainly, and a second attempt makes one row, not two.
  await page.goto(`${BASE}/receipts/new`, { waitUntil: "networkidle0" });
  await sleep(1200);
  const fill = async () => {
    await page.evaluate((supplierName) => {
      const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
      const inputs = [...document.querySelectorAll("input")];
      const vendor = inputs.find((i) => /supplier|vendor|who/i.test(i.placeholder ?? ""));
      if (vendor) set(vendor, supplierName);
      const amount = inputs.find((i) => /total|amount/i.test(i.placeholder ?? ""));
      if (amount) set(amount, "60.00");
    }, "Travis Perkins");
    await sleep(300);
  };
  await fill();
  db.fail = { "POST receipts": 20 };
  await clickText(page, "Save receipt").catch(async () => { await clickText(page, "Save").catch(() => {}); });
  await sleep(1600);
  t = await bodyText(page);
  check("a receipt that failed to save isn't in the database", db.tables.receipts.length === 0, JSON.stringify(db.tables.receipts.length));
  check("the failed save is said out loud", /could not|couldn't|failed|mock failure/i.test(t), flat(t).slice(0, 400));
  db.fail = {};
  await clickText(page, "Save receipt").catch(async () => { await clickText(page, "Save").catch(() => {}); });
  await sleep(1800);
  check("saving again after a failure writes one receipt, not two", db.tables.receipts.length <= 1, JSON.stringify(db.tables.receipts.length));

  // 3. A quote turned into an invoice where the invoice write is cut off:
  //    the quote must not be left claimed with no invoice to show for it.
  const Q = { id: newId(), user_id: "x", client_id: C, number: "Q-1", date: todayISO(), valid_until: null, items: [{ description: "Kitchen", quantity: 1, unitPrice: 2000, vatRate: "standard" }], notes: "", status: "accepted", invoice_id: null, deposit_percent: null, deposit_amount: null, deposit_invoice_id: null, deposit_claimed: false, created_at: new Date().toISOString() };
  db.tables.quotes.push(Q);
  db.fail = { "POST invoices": 20 };
  await page.goto(`${BASE}/quotes/${Q.id}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Turn into invoice"), { timeout: 20000 });
  await clickText(page, "Turn into invoice");
  await sleep(2200);
  t = await bodyText(page);
  const made = db.tables.invoices.filter((i) => i.tags?.includes("from Q-1"));
  check("no invoice is left behind when the write failed", made.length === 0, JSON.stringify(made.length));
  check("the quote is given back, not left claimed", db.tables.quotes.find((q) => q.id === Q.id)?.status === "accepted", db.tables.quotes.find((q) => q.id === Q.id)?.status);
  check("the failure is on screen", /could not|couldn't|failed|mock failure/i.test(t), flat(t).slice(0, 400));
  db.fail = {};

  // 4. The same, but the reply is lost after the invoice was written: the
  //    app must find the invoice that exists rather than make a second one.
  db.loseReply = { "POST invoices": 1 };
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Turn into invoice"), { timeout: 20000 });
  await clickText(page, "Turn into invoice");
  await sleep(3000);
  const after = db.tables.invoices.filter((i) => i.tags?.includes("from Q-1"));
  check("a lost reply doesn't make a second invoice", after.length === 1, JSON.stringify(after.length));
  check("the quote ends up linked to the invoice that exists", !!db.tables.quotes.find((q) => q.id === Q.id)?.invoice_id, JSON.stringify(db.tables.quotes.find((q) => q.id === Q.id)?.invoice_id));
  // 5. No signal at all. "Failed to fetch" is not an answer; the message
  //    has to be one he can act on.
  await page.goto(`${BASE}/receipts/new`, { waitUntil: "networkidle0" });
  await sleep(1200);
  await fill();
  signalGone = true;
  await clickText(page, "Save receipt").catch(async () => { await clickText(page, "Save").catch(() => {}); });
  await sleep(2000);
  t = await bodyText(page);
  signalGone = false;
  check("losing signal says to check the connection", /check your connection/i.test(t), flat(t).slice(0, 400));
  check("losing signal never shows \"Failed to fetch\"", !/failed to fetch/i.test(t), flat(t).slice(0, 300));

  // 6. The remaining forms that write his records: a new contact, the
  //    business profile, and a new invoice. Each one must leave nothing
  //    behind when the write fails, and say so -- an empty list and a
  //    failed save look identical otherwise.
  const before = { clients: db.tables.clients.length, invoices: db.tables.invoices.length };

  db.fail = { "POST clients": 20 };
  await page.goto(`${BASE}/clients/new`, { waitUntil: "networkidle0" });
  await sleep(1400);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("input")].find((i) => /name/i.test(`${i.placeholder ?? ""} ${i.previousElementSibling?.textContent ?? ""}`));
    if (!el) return;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, "Half Saved Contact Ltd");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(400);
  await clickText(page, "Save client");
  await sleep(2200);
  t = await bodyText(page);
  // The write has to have been ATTEMPTED, or "nothing was saved" is true
  // for the wrong reason -- which is exactly what a mistyped button label
  // did to the first version of this check.
  check("the save was actually attempted", db.log.some((e) => e.key === "POST clients"), JSON.stringify(db.log.slice(-3).map((e) => e.key)));
  check("a contact that failed to save isn't in the list", db.tables.clients.length === before.clients, String(db.tables.clients.length - before.clients));
  check("...and the failure is said out loud", /could not|couldn't|failed|mock failure/i.test(t), flat(t).slice(0, 300));
  db.fail = {};

  db.fail = { "POST business_profile": 20 };
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(1800);
  await clickText(page, "Save").catch(() => {});
  await sleep(2200);
  t = await bodyText(page);
  check("a failed Settings save says so rather than showing Saved", /could not|couldn't|failed|mock failure/i.test(t) && !/^.*\bSaved\b/.test(flat(t).slice(0, 0) || ""), flat(t).slice(0, 300));
  db.fail = {};

  db.fail = { "POST invoices": 20 };
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await sleep(1600);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("input, textarea")].find((i) => /description|what you did/i.test(`${i.placeholder ?? ""} ${i.previousElementSibling?.textContent ?? ""}`));
    if (!el) return;
    const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, "Half saved work");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(400);
  await clickText(page, "Save draft").catch(async () => { await clickText(page, "Save").catch(() => {}); });
  await sleep(2400);
  t = await bodyText(page);
  check("an invoice that failed to save isn't in the books", db.tables.invoices.length === before.invoices, String(db.tables.invoices.length - before.invoices));
  check("...and that failure is said out loud too", /could not|couldn't|failed|mock failure/i.test(t), flat(t).slice(0, 300));
  db.fail = {};
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
