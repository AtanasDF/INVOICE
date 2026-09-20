import { makeDb, launchSignedIn, signIn, sleep, clickText, bodyText, shot, newId } from "./mockdb.mjs";
const BASE = "http://localhost:3600";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const today = new Date().toISOString().slice(0, 10);
const db = makeDb();
const C = newId(), I1 = newId(), I2 = newId();
db.tables.business_profile.push({ business_name: "Harness Ltd", vat_registered: true, show_overdue_reminders: false });
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Ltd", email: "acme@example.com", kind: "client", archived: false, is_company: true, reminders_enabled: true });
const inv = (id, number, price) => ({ id, user_id: "x", client_id: C, date: "2026-09-01", number, items: [{ description: "Work", quantity: 1, unitPrice: price, vatRate: "standard" }], notes: null, due_date: "2026-10-01", payment_terms: "30 days", status: "sent", tags: [] });
db.tables.invoices.push(inv(I1, "INV-1", 1000), inv(I2, "INV-2", 100));
db.tables.invoice_payments = []; db.allowDelete = ["invoice_payments"]; db.tables.credit_notes = []; db.tables.invoice_reminders_sent = []; db.tables.receipts = []; db.tables.recurring_expenses = [];
const setVal = (page, sel, v) => page.evaluate((s, v) => { const el = document.querySelector(s); const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); }, sel, v);
const waitText = (page, t) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout: 20000 }, t);
const i1 = () => db.tables.invoices.find((i) => i.id === I1);
const { browser, page } = await launchSignedIn(db, { base: BASE });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/invoices/${I1}`, { waitUntil: "networkidle0" });
  await waitText(page, "Record a payment");
  await clickText(page, "+ Record a payment");
  await sleep(200);
  const pre = await page.$eval('input[aria-label="Amount received"]', (e) => e.value);
  check("amount prefilled with the balance", pre === "1200.00", pre);
  await setVal(page, 'input[aria-label="Amount received"]', "1500");
  await clickText(page, "Save payment");
  await waitText(page, "more than the £1,200.00 still owed");
  check("overpayment refused", db.tables.invoice_payments.length === 0);
  await setVal(page, 'input[aria-label="Amount received"]', "500");
  await clickText(page, "Save payment");
  await waitText(page, "Still owed: £700.00");
  check("part-payment recorded, status part-paid", db.tables.invoice_payments.length === 1 && db.tables.invoice_payments[0].amount === 500 && db.tables.invoice_payments[0].method === "bank" && i1().status === "partial", JSON.stringify({ p: db.tables.invoice_payments, s: i1().status }));
  const t = await bodyText(page);
  check("invoice shows the payment and £700 due", t.includes("−£500.00") && t.includes("Amount due: £700.00"), t.match(/Amount due: £[\d.,]+/)?.[0]);
  check("reminders card chases the part-paid invoice", t.includes("7 days after due") && !t.includes("balance isn't known"));
  await clickText(page, "Mark as paid");
  await waitText(page, "Paid in full.");
  check("mark as paid records the remaining £700 and sets paid", db.tables.invoice_payments.length === 2 && db.tables.invoice_payments[1].amount === 700 && i1().status === "paid", JSON.stringify(db.tables.invoice_payments));
  await shot(page, "payments-paid");
  await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Remove")[1].click());
  await waitText(page, "Still owed: £700.00");
  check("removing a payment puts the status back to part-paid", i1().status === "partial" && db.log.some((l) => l.key === "DELETE invoice_payments"), i1().status);

  await page.goto(`${BASE}/invoices`, { waitUntil: "networkidle0" });
  await waitText(page, "INV-1");
  const list = await bodyText(page);
  check("list shows paid and still owed", list.includes("£500.00 paid, £700.00 still owed"), list.match(/£[\d.]+ paid[^\n]*/)?.[0]);
  const clicked = await page.evaluate(() => {
    const card = [...document.querySelectorAll("div.rounded-xl")].find((d) => d.innerText.includes("INV-2") && !d.innerText.includes("INV-1"));
    const b = card && [...card.querySelectorAll("button")].find((x) => x.textContent.trim() === "Mark as paid");
    b?.click();
    return !!b;
  });
  if (!clicked) console.log("no Mark as paid button on INV-2");
  await sleep(800);
  const p2 = db.tables.invoice_payments.find((p) => p.invoice_id === I2);
  check("quick mark paid records the full £120", p2?.amount === 120 && db.tables.invoices.find((i) => i.id === I2).status === "paid", JSON.stringify(p2));

  // Credited in full, nothing paid: settled.
  const I3 = newId(), I4 = newId(), I5 = newId();
  db.tables.invoices.push(inv(I3, "INV-3", 100), { ...inv(I4, "INV-4", 100), status: "partial" }, inv(I5, "INV-5", 100));
  await page.goto(`${BASE}/invoices/${I3}`, { waitUntil: "networkidle0" });
  await waitText(page, "New credit note");
  await clickText(page, "+ New credit note");
  await sleep(200);
  await setVal(page, 'input[placeholder="Amount to credit (£)"]', "120");
  await clickText(page, "Save credit note");
  await sleep(1200);
  check("a full credit note settles the invoice", db.tables.invoices.find((i) => i.id === I3).status === "paid", db.tables.invoices.find((i) => i.id === I3).status);

  // Marked part-paid by hand before payments existed: Mark as paid invents nothing.
  await page.goto(`${BASE}/invoices/${I4}`, { waitUntil: "networkidle0" });
  await waitText(page, "Mark as unpaid");
  await clickText(page, "Mark as paid");
  await sleep(1000);
  check("legacy part-paid: marked paid with no invented payment", db.tables.invoices.find((i) => i.id === I4).status === "paid" && !db.tables.invoice_payments.some((p) => p.invoice_id === I4));

  // One payment in, then removed: back to sent.
  await page.goto(`${BASE}/invoices/${I5}`, { waitUntil: "networkidle0" });
  await waitText(page, "Record a payment");
  await clickText(page, "+ Record a payment");
  await sleep(200);
  await setVal(page, 'input[aria-label="Amount received"]', "20");
  await clickText(page, "Save payment");
  await waitText(page, "Still owed: £100.00");
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Remove").click());
  await sleep(1200);
  check("removing the only payment puts it back to sent", db.tables.invoices.find((i) => i.id === I5).status === "sent", db.tables.invoices.find((i) => i.id === I5).status);

  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await waitText(page, "Awaiting payment");
  const dash = await bodyText(page);
  check("dashboard counts only the £700 still owed", dash.includes("£700.00") && !dash.includes("£1,200.00") && !dash.includes("£1,200.00"), dash.slice(0, 600));
} catch (e) {
  console.log("ERROR", e.message);
  await shot(page, "payments-error");
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
