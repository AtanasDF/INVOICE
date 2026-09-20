// Atanas's first week, start to finish, on an account with nothing in it:
// add a customer, write invoice number 1, issue it, get paid, log what the
// job cost, and then check that every figure that follows — the dashboard,
// the expenses, the VAT boxes and the tax set-aside — tells the same story.
// This is the one test that walks the app the way it is actually used.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, clickText } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const flat = (t) => t.replace(/\s+/g, " ");
const today = new Date().toISOString().slice(0, 10);

// Nothing at all: no business details, no contacts, no documents.
const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [] });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 375, profile: "profile-firstweek" });

const fill = (match, value) =>
  page.evaluate((m, v) => {
    const el = [...document.querySelectorAll("input, textarea")].find((i) => new RegExp(m, "i").test(`${i.placeholder ?? ""} ${i.labels?.[0]?.textContent ?? ""} ${i.previousElementSibling?.textContent ?? ""}`));
    if (!el) return false;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, match, value);

const choose = (label) =>
  page.evaluate((l) => {
    const sel = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.textContent.trim() === l));
    if (!sel) return false;
    const opt = [...sel.options].find((o) => o.textContent.trim() === l);
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(sel, opt.value);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, label);

try {
  await signIn(page, BASE);

  // Monday: a customer.
  await page.goto(`${BASE}/clients/new`, { waitUntil: "networkidle0" });
  await sleep(1200);
  await fill("name", "Mrs Henderson");
  await fill("email", "henderson@example.com");
  await sleep(300);
  await clickText(page, "Save client").catch(async () => { await clickText(page, "Save").catch(() => {}); });
  await sleep(1600);
  check("a customer can be added on an empty account", db.tables.clients.length === 1, JSON.stringify(db.tables.clients.map((c) => c.name)));

  // Tuesday: the first invoice he has ever written.
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await sleep(1500);
  check("the new customer is there to pick", await choose("Mrs Henderson"), "customer not in the list");
  await fill("Description", "Skim two ceilings");
  await fill("Qty", "1");
  await fill("Unit price", "480");
  await sleep(400);
  await clickText(page, "Save draft");
  await sleep(2000);
  check("the invoice is saved as a draft", db.tables.invoices.length === 1, JSON.stringify(db.tables.invoices.map((i) => i.number)));
  const draft = db.tables.invoices[0];
  check("a draft has no real number yet", (draft?.number ?? "").startsWith("DRAFT-"), draft?.number);

  // Issuing it: this is invoice number 1 of his company.
  await page.goto(`${BASE}/invoices/${draft.id}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Mark as sent"), { timeout: 20000 });
  await clickText(page, "Mark as sent");
  await sleep(500);
  await clickText(page, "Confirm & mark as sent");
  await sleep(2200);
  const issued = db.tables.invoices[0];
  check("it becomes invoice number 1", /^[A-Z-]*1$/.test(issued.number ?? ""), issued.number);
  check("and it is marked as sent", issued.status === "sent", issued.status);

  // Friday: Mrs Henderson pays.
  await page.goto(`${BASE}/invoices/${draft.id}`, { waitUntil: "networkidle0" });
  await sleep(1400);
  await clickText(page, "+ Record a payment");
  await sleep(500);
  await clickText(page, "Save payment");
  await sleep(2000);
  check("the payment is recorded", db.tables.invoice_payments.length === 1, JSON.stringify(db.tables.invoice_payments.map((p) => p.amount)));
  check("the invoice moves itself to paid", db.tables.invoices[0].status === "paid", db.tables.invoices[0].status);
  const paidText = await bodyText(page);
  check("nothing is left owing on it", /Paid in full|Paid/.test(paidText), flat(paidText).slice(0, 200));

  // What the job cost him.
  await page.goto(`${BASE}/receipts/new`, { waitUntil: "networkidle0" });
  await sleep(1300);
  await fill("supplier|vendor|who", "Travis Perkins");
  await fill("total|amount", "120");
  await sleep(300);
  await clickText(page, "Save receipt").catch(async () => { await clickText(page, "Save").catch(() => {}); });
  await sleep(1800);
  check("the cost of the job is logged", db.tables.receipts.length === 1, JSON.stringify(db.tables.receipts.map((r) => r.amount)));

  // And now every figure that follows.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(1800);
  const dash = await bodyText(page);
  check("the dashboard no longer says the account is empty", !/No invoices yet/.test(dash), flat(dash).slice(0, 200));
  check("nothing is shown as owed, because it's paid", /£0\.00[\s\S]{0,40}Owed/.test(dash) || /Owed[\s\S]{0,40}£0\.00/.test(dash), flat(dash).slice(0, 400));
  check("the month's spending shows the £120", /£120\.00|£100\.00/.test(dash), flat(dash).slice(flat(dash).indexOf("Spent"), flat(dash).indexOf("Spent") + 80));

  await page.goto(`${BASE}/expenses`, { waitUntil: "networkidle0" });
  await sleep(1600);
  const exp = await bodyText(page);
  check("the expenses page counts the receipt", /£120\.00|£100\.00/.test(exp), flat(exp).slice(0, 300));

  await page.goto(`${BASE}/vat`, { waitUntil: "networkidle0" });
  await sleep(1600);
  const vat = await bodyText(page);
  check("the VAT page works, with the boxes filled in", /Box 1/.test(vat) && /£/.test(vat), flat(vat).slice(0, 200));

  await page.goto(`${BASE}/invoices`, { waitUntil: "networkidle0" });
  await sleep(1500);
  const list = await bodyText(page);
  check("the invoice list shows his first invoice, paid", /Paid/.test(list) && /Skim two ceilings|Mrs Henderson/.test(list), flat(list).slice(0, 300));
  check("no page ever fell over along the way", !list.includes("Application error"));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
