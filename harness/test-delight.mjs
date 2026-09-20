import { makeDb, launchSignedIn, signIn, sleep, clickText, bodyText, shot, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const today = new Date().toISOString().slice(0, 10);
const db = makeDb();
const C = newId(), I1 = newId(), I2 = newId(), I3 = newId();
db.tables.business_profile.push({ business_name: "Harness Ltd", vat_registered: true, show_overdue_reminders: true });
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Ltd", email: "acme@example.com", kind: "client", archived: false, is_company: true, reminders_enabled: true });
const inv = (id, number, price, due) => ({ id, user_id: "x", client_id: C, date: "2026-08-01", number, items: [{ description: "Work", quantity: 1, unitPrice: price, vatRate: "standard" }], notes: null, due_date: due, payment_terms: "30 days", status: "sent", tags: [] });
db.tables.invoices.push(inv(I1, "INV-1", 1000, "2026-10-30"), inv(I2, "INV-2", 100, "2026-09-01"), inv(I3, "INV-3", 50, "2026-09-02"));
db.tables.invoice_payments = [{ id: newId(), user_id: "x", invoice_id: I3, date: today, amount: 10, method: "bank", note: "" }];
db.allowDelete = ["invoice_payments"]; db.tables.credit_notes = []; db.tables.invoice_reminders_sent = [];
db.tables.receipts = [{ id: newId(), user_id: "x", document_type: "invoice", paid: false, needs_review: false, due_date: today, date: today, amount: 10, vat_amount: 2, vendor: "Supplier", category: "Materials" }];
db.tables.recurring_expenses = [];
const waitText = (page, t) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout: 20000 }, t);
const { browser, page } = await launchSignedIn(db, { base: BASE });
try {
  await page.evaluateOnNewDocument(() => { window.__badges = []; navigator.setAppBadge = async (n) => { window.__badges.push(n); }; navigator.clearAppBadge = async () => { window.__badges.push(0); }; });
  await signIn(page, BASE);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await waitText(page, "Dashboard");
  await sleep(800);
  const badges = await page.evaluate(() => window.__badges);
  check("home-screen badge counts overdue invoices and bills due soon", badges[badges.length - 1] === 3, JSON.stringify(badges));

  await page.goto(`${BASE}/invoices/${I1}`, { waitUntil: "networkidle0" });
  await waitText(page, "Mark as paid");
  await clickText(page, "Mark as paid");
  await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some((e) => e.innerText.includes("Paid")), { timeout: 8000 });
  await sleep(500);
  const card = await page.evaluate(() => [...document.querySelectorAll('[role="status"]')].find((e) => e.innerText.includes("Paid"))?.innerText);
  await shot(page, "paid-moment");
  check("marking paid celebrates with the amount and customer", /Paid/.test(card) && card.includes("£1,200.00 from Acme Ltd") && card.includes("Invoice INV-1"), card);
  check("…and what's come in this month", /£1,210\.00 in this month/.test(card), card);
  await sleep(2600);
  check("…then gets out of the way", !(await page.evaluate(() => [...document.querySelectorAll('[role="status"]')].some((e) => e.innerText.includes("Paid") && e.innerText.includes("Acme")))));

  await page.goto(`${BASE}/invoices/${I3}`, { waitUntil: "networkidle0" });
  await waitText(page, "Record a payment");
  await clickText(page, "+ Record a payment");
  await sleep(200);
  await page.evaluate(() => { const el = document.querySelector('input[aria-label="Amount received"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "20"); el.dispatchEvent(new Event("input", { bubbles: true })); });
  await clickText(page, "Save payment");
  await sleep(1500);
  check("a part-payment doesn't celebrate", !(await page.evaluate(() => [...document.querySelectorAll('[role="status"]')].some((e) => /^\s*Paid/.test(e.innerText)))));

  await page.goto(`${BASE}/invoices`, { waitUntil: "networkidle0" });
  await waitText(page, "INV-2");
  await page.evaluate(() => { const card = [...document.querySelectorAll("div.rounded-xl")].find((d) => d.innerText.includes("INV-2") && !d.innerText.includes("INV-1")); [...card.querySelectorAll("button")].find((x) => x.textContent.trim() === "Mark as paid").click(); });
  await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some((e) => e.innerText.includes("Paid")), { timeout: 8000 });
  const c2 = await page.evaluate(() => [...document.querySelectorAll('[role="status"]')].find((e) => e.innerText.includes("Paid"))?.innerText);
  check("quick mark paid from the list celebrates too", c2.includes("£120.00 from Acme Ltd"), c2);
  const passThrough = await page.evaluate(() => { const o = [...document.querySelectorAll('[role="status"]')].find((e) => e.innerText.includes("Paid")); return getComputedStyle(o).pointerEvents; });
  check("taps elsewhere go through to the page", passThrough === "none", passThrough);
  await page.evaluate(() => document.querySelector(".paid-pop").click());
  await sleep(200);
  check("a tap on the card dismisses it", !(await page.evaluate(() => [...document.querySelectorAll('[role="status"]')].some((e) => e.innerText.includes("£120.00")))));
} catch (e) { console.log("ERROR", e.message); await shot(page, "delight-error"); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
