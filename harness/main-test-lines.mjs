import { makeDb, launchSignedIn, signIn, sleep, bodyText, shot, newId } from "./mockdb.mjs";
const BASE = "http://localhost:3600";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const db = makeDb();
const C = newId(), I = newId();
db.tables.business_profile.push({ business_name: "Harness Ltd", vat_registered: true });
db.tables.clients.push({ id: C, user_id: "x", name: "Jane", email: "j@example.com", kind: "client", archived: false, is_company: true, reminders_enabled: true });
db.tables.invoices.push({ id: I, user_id: "x", client_id: C, date: "2026-09-19", number: "DRAFT-a", items: [{ description: "Work", quantity: 1, unitPrice: 10, vatRate: "standard" }], notes: null, due_date: "2026-10-19", payment_terms: "30 days", status: "draft", tags: [] });
db.tables.credit_notes = []; db.tables.recurring_invoices = [];
const typeIn = async (page, sel, i, text) => {
  const el = (await page.$$(sel))[i];
  await el.focus();
  await el.evaluate((e) => e.select());
  await page.keyboard.press("Backspace");
  await page.keyboard.type(text, { delay: 30 });
};
const { browser, page } = await launchSignedIn(db, { base: BASE });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/invoices/${I}`, { waitUntil: "networkidle0" });
  await page.waitForSelector('input[aria-label="Unit price"]', { timeout: 30000 });
  await typeIn(page, 'input[aria-label="Unit price"]', 0, "12.5");
  await typeIn(page, 'input[aria-label="Quantity"]', 0, "2");
  await sleep(300);
  const v = await page.$eval('input[aria-label="Unit price"]', (e) => e.value);
  check("draft invoice: 12.5 stays 12.5", v === "12.5", v);
  check("draft invoice: total 2 × 12.5 + VAT = £30.00", (await bodyText(page)).includes("Total: £30.00"), (await bodyText(page)).match(/Total: £[\d.]+/)?.[0]);
  await typeIn(page, 'input[aria-label="Quantity"]', 0, "-1");
  await sleep(200);
  check("draft invoice: a minus sign can be typed", (await page.$eval('input[aria-label="Quantity"]', (e) => e.value)) === "-1");
  check("draft invoice fits 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  const w = await page.$eval('input[placeholder="Description"]', (e) => e.getBoundingClientRect().width);
  check("description gets the full row on a phone", w > 250, w);
  await shot(page, "lines-draft");

  await page.goto(`${BASE}/recurring/invoices`, { waitUntil: "networkidle0" });
  await page.waitForSelector('input[aria-label="Unit price"]', { timeout: 30000 });
  await typeIn(page, 'input[aria-label="Unit price"]', 0, "99.95");
  await sleep(200);
  check("recurring invoice: 99.95 stays 99.95", (await page.$eval('input[aria-label="Unit price"]', (e) => e.value)) === "99.95");

  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await page.waitForSelector('input[aria-label="Unit price"]', { timeout: 30000 });
  check("new invoice fits 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
} catch (e) {
  console.log("ERROR", e.message);
  await shot(page, "lines-error");
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
